import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileSessionStore,
  FencedError,
  InMemorySessionStore,
  SessionContendedError,
} from "./session-store.ts";
import { Daemon } from "./daemon.ts";
import { Journal, readEvents } from "../journal/journal.ts";
import { PolicyEngine } from "../policy/engine.ts";
import { RecordingSandbox } from "../runtime/sandbox.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { ScriptedIntendant } from "../runtime/intendant.ts";
import { generateSigningKeyPem, loadPrivateKey } from "../runtime/crypto.ts";

const T0 = Date.parse("2026-06-21T00:00:00.000Z");
const TTL = 1000;

function journalAt(dir: string): Journal {
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  return new Journal(join(dir, "audit.log"), priv, () => "2026-06-21T00:00:00.000Z");
}

// --- store algebra (InMemory) ------------------------------------------------

test("acquire mints a lease with fencing token 1, active, and the given owner", () => {
  const s = new InMemorySessionStore();
  const lease = s.acquire("s1", "A", T0, TTL);
  expect(lease.fencingToken).toBe(1);
  expect(lease.ownerInstanceId).toBe("A");
  expect(lease.status).toBe("active");
  expect(Date.parse(lease.expiresAt)).toBe(T0 + TTL);
  expect(s.get("s1")?.sessionId).toBe("s1");
});

test("re-acquiring an EXPIRED lease supersedes it with a higher fencing token", () => {
  const s = new InMemorySessionStore();
  s.acquire("s1", "A", T0, TTL);
  // A crashed; lease expires. B takes over after expiry.
  const b = s.acquire("s1", "B", T0 + TTL + 1, TTL);
  expect(b.fencingToken).toBe(2);
  expect(b.ownerInstanceId).toBe("B");
});

test("acquiring a session a DIFFERENT live owner holds is refused (contention)", () => {
  const s = new InMemorySessionStore();
  s.acquire("s1", "A", T0, 10_000); // still live
  expect(() => s.acquire("s1", "B", T0 + 1, 10_000)).toThrow(SessionContendedError);
  // The same owner re-acquiring its own live lease is fine (idempotent restart).
  expect(s.acquire("s1", "A", T0 + 1, 10_000).fencingToken).toBe(2);
});

test("heartbeat refreshes expiry; a superseded (fenced) holder is rejected", () => {
  const s = new InMemorySessionStore();
  const a = s.acquire("s1", "A", T0, TTL);
  const a2 = s.heartbeat(a, T0 + 100, TTL);
  expect(Date.parse(a2.expiresAt)).toBe(T0 + 100 + TTL);
  // B supersedes after expiry; A's stale lease can no longer heartbeat.
  s.acquire("s1", "B", T0 + TTL + 200, TTL);
  expect(() => s.heartbeat(a, T0 + TTL + 250, TTL)).toThrow(FencedError);
});

test("release marks the lease released; a fenced release is a no-op", () => {
  const s = new InMemorySessionStore();
  const a = s.acquire("s1", "A", T0, TTL);
  s.release(a, T0 + 10);
  expect(s.get("s1")?.status).toBe("released");
  // A released lease is not reapable.
  expect(s.reapExpired(T0 + 10_000)).toHaveLength(0);
});

test("reapExpired reaps only active, past-expiry leases", () => {
  const s = new InMemorySessionStore();
  s.acquire("live", "A", T0, 10_000); // unexpired
  s.acquire("dead", "A", T0, TTL); // will expire
  const reaped = s.reapExpired(T0 + TTL + 1);
  expect(reaped.map((l) => l.sessionId)).toEqual(["dead"]);
  expect(s.get("dead")?.status).toBe("reaped");
  expect(s.get("live")?.status).toBe("active");
});

// --- file persistence --------------------------------------------------------

test("FileSessionStore persists a lease across instances; a corrupt file reads empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-sess-"));
  const path = join(dir, "sessions.json");
  new FileSessionStore(path).acquire("s1", "A", T0, TTL);
  // A fresh instance reads the persisted lease (survives a process restart).
  expect(new FileSessionStore(path).get("s1")?.ownerInstanceId).toBe("A");
  // Corrupt file → treated as empty (must not crash the daemon).
  writeFileSync(path, "{ not json");
  expect(new FileSessionStore(path).list()).toEqual([]);
  rmSync(dir, { recursive: true, force: true });
});

// --- daemon crash recovery (the acceptance scenario) -------------------------

test("a restarted daemon REAPS a session orphaned by a crash, and journals it", () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-sess-"));
  const store = new InMemorySessionStore();

  // Daemon A acquires a session lease, then "crashes" — the process dies, so
  // release is never called (a crash IS exactly: lease taken, never released).
  store.acquire("s-crash", "A", T0, TTL);

  // Daemon B starts later (past the lease TTL) and runs recovery.
  const journal = journalAt(dir);
  const daemonB = new Daemon({
    policy: new PolicyEngine([]),
    journal,
    sandbox: new RecordingSandbox(),
    channel: new ConsoleChannel({}, () => {}),
    sessionStore: store,
    instanceId: "B",
    nowMs: () => T0 + TTL + 5000,
  });

  const reaped = daemonB.recoverSessions();
  expect(reaped.map((l) => l.sessionId)).toEqual(["s-crash"]);
  expect(store.get("s-crash")?.status).toBe("reaped");

  const ev = readEvents(join(dir, "audit.log")).find((e) => e.kind === "session.reaped");
  expect(ev?.payload).toMatchObject({ sessionId: "s-crash", reapedBy: "B" });
  rmSync(dir, { recursive: true, force: true });
});

test("a CLEAN scripted session releases its lease and is never reaped", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-sess-"));
  const store = new InMemorySessionStore();
  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "allow-read", effect: "allow", tool: "Read" }]),
    journal: journalAt(dir),
    sandbox: new RecordingSandbox(),
    channel: new ConsoleChannel({}, () => {}),
    sessionStore: store,
    instanceId: "A",
    nowMs: () => T0,
    leaseTtlMs: TTL,
  });

  await daemon.runScripted(new ScriptedIntendant([{ tool: "Read", args: { path: "/x" } }]), { sessionId: "s-ok" });

  expect(store.get("s-ok")?.status).toBe("released");
  // Recovery long after the run reaps nothing — a released lease is terminal.
  expect(daemon.recoverSessions()).toHaveLength(0);
  rmSync(dir, { recursive: true, force: true });
});
