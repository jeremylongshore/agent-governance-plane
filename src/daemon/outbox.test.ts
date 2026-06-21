import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileOutboxStore, InMemoryOutboxStore } from "./outbox-store.ts";
import { OutboxRelay, type ProjectionChannel } from "./outbox-relay.ts";
import { OutboxDelivery } from "../contracts/outbox-delivery.ts";

const NOW = "2026-06-21T00:00:00.000Z";

class FakeChannel implements ProjectionChannel {
  readonly posts: { eventKind: string; summary: string }[] = [];
  mode: "ok" | "fail" | "throw" = "ok";
  projectEvent(eventKind: string, summary: string): Promise<boolean> {
    if (this.mode === "throw") return Promise.reject(new Error("channel down"));
    if (this.mode === "fail") return Promise.resolve(false);
    this.posts.push({ eventKind, summary });
    return Promise.resolve(true);
  }
}

function idGen(): () => string {
  let i = 0;
  return () => `d${++i}`;
}

function relay(channel: ProjectionChannel, store = new InMemoryOutboxStore()) {
  return { relay: new OutboxRelay(channel, store, { now: () => NOW, genId: idGen() }), store };
}

// --- store algebra -----------------------------------------------------------

test("enqueue is idempotent; pending filters delivered; attempts + delivered are terminal", () => {
  const s = new InMemoryOutboxStore();
  const d = OutboxDelivery.parse({ id: "x", eventKind: "e", summary: "s", enqueuedAt: NOW });
  s.enqueue(d);
  s.enqueue({ ...d, summary: "changed" }); // idempotent: same id, no overwrite
  expect(s.get("x")?.summary).toBe("s");
  expect(s.pending().map((p) => p.id)).toEqual(["x"]);

  s.recordAttempt("x");
  s.recordAttempt("x");
  expect(s.get("x")?.attempts).toBe(2);

  s.markDelivered("x", NOW);
  expect(s.get("x")?.status).toBe("delivered");
  expect(s.get("x")?.deliveredAt).toBe(NOW);
  expect(s.pending()).toHaveLength(0);
});

// --- relay -------------------------------------------------------------------

test("project delivers immediately when the channel accepts", async () => {
  const ch = new FakeChannel();
  const { relay: r, store } = relay(ch);
  const entry = await r.project("session.ended", "ok");
  expect(entry.status).toBe("delivered");
  expect(entry.attempts).toBe(1);
  expect(ch.posts).toEqual([{ eventKind: "session.ended", summary: "ok" }]);
  expect(store.pending()).toHaveLength(0);
});

test("a FAILED projection enqueues a retryable obligation instead of dropping it", async () => {
  const ch = new FakeChannel();
  ch.mode = "fail";
  const { relay: r, store } = relay(ch);
  const entry = await r.project("session.ended", "held");
  expect(entry.status).toBe("pending");
  expect(entry.attempts).toBe(1);
  expect(ch.posts).toHaveLength(0);
  expect(store.pending().map((p) => p.id)).toEqual(["d1"]);
});

test("project never throws even when the channel throws — obligation stays pending", async () => {
  const ch = new FakeChannel();
  ch.mode = "throw";
  const { relay: r, store } = relay(ch);
  const entry = await r.project("session.ended", "held");
  expect(entry.status).toBe("pending");
  expect(store.pending()).toHaveLength(1);
});

// --- the acceptance scenario: at-least-once across a restart -----------------

test("AT-LEAST-ONCE: an obligation enqueued before a crash is redelivered after restart", async () => {
  // Shared store == the durable file that survives the process restart.
  const store = new InMemoryOutboxStore();

  // Pre-crash: the channel is down, so the projection is held (not lost).
  const down = new FakeChannel();
  down.mode = "fail";
  const pre = new OutboxRelay(down, store, { now: () => NOW, genId: idGen() });
  await pre.project("session.ended", "survive me");
  expect(store.pending()).toHaveLength(1);

  // "Restart": a fresh relay over the SAME store, channel now reachable. The
  // startup drain redelivers the held obligation (same id — consumers dedup on it).
  const up = new FakeChannel();
  const post = new OutboxRelay(up, store, { now: () => NOW, genId: idGen() });
  const result = await post.drain();

  expect(result).toEqual({ delivered: 1, stillPending: 0 });
  expect(up.posts).toEqual([{ eventKind: "session.ended", summary: "survive me" }]);
  expect(store.get("d1")?.status).toBe("delivered");
  expect(store.get("d1")?.attempts).toBe(2); // 1 pre-crash + 1 on redelivery

  // Idempotent: a second drain delivers nothing (terminal).
  expect(await post.drain()).toEqual({ delivered: 0, stillPending: 0 });
  expect(up.posts).toHaveLength(1);
});

// --- file persistence --------------------------------------------------------

test("FileOutboxStore persists a pending obligation across instances; corrupt reads empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-outbox-"));
  const path = join(dir, "outbox.json");
  new FileOutboxStore(path).enqueue(OutboxDelivery.parse({ id: "x", eventKind: "e", summary: "s", enqueuedAt: NOW }));
  // A fresh instance (a restart) sees the pending obligation.
  expect(new FileOutboxStore(path).pending().map((p) => p.id)).toEqual(["x"]);
  // Corrupt file → empty (must not crash the daemon).
  writeFileSync(path, "{ not json");
  expect(new FileOutboxStore(path).list()).toEqual([]);
  rmSync(dir, { recursive: true, force: true });
});
