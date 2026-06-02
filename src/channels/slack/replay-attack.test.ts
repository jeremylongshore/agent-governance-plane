// Replay-attack coverage (Epic 08 acceptance): an approval nonce is one-time and
// cannot be reused, expired, or used against a different request.

import { test, expect } from "bun:test";
import { NonceStore } from "./nonce-store.ts";
import { SlackChannel } from "./slack-channel.ts";
import { InMemoryInteractionSource } from "./interactions.ts";
import type { SlackTransport, PostResult } from "./transport.ts";
import type { SlackBlock } from "./blocks.ts";
import { validApprovalRequest } from "../../contracts/fixtures.ts";

class NoopTransport implements SlackTransport {
  postMessage(_c: string, _b: SlackBlock[], _t: string): Promise<PostResult> {
    return Promise.resolve({ ts: "ts-1" });
  }
  updateMessage(): Promise<void> {
    return Promise.resolve();
  }
}

test("NonceStore: a consumed nonce cannot be consumed again (replay rejected)", () => {
  const store = new NonceStore({ gen: () => "N" });
  const nonce = store.mint({ messageId: "m1", sessionId: "s1" });
  expect(store.consume(nonce, "m1").ok).toBe(true);
  const replay = store.consume(nonce, "m1");
  expect(replay.ok).toBe(false);
  expect(replay.reason).toContain("replay");
});

test("NonceStore: a nonce bound to one request is rejected for another", () => {
  const store = new NonceStore({ gen: () => "N" });
  const nonce = store.mint({ messageId: "m1", sessionId: "s1" });
  const wrong = store.consume(nonce, "m2");
  expect(wrong.ok).toBe(false);
  expect(wrong.reason).toContain("not bound");
});

test("NonceStore: an expired nonce is rejected", () => {
  let t = 1000;
  const store = new NonceStore({ ttlMs: 100, now: () => t, gen: () => "N" });
  const nonce = store.mint({ messageId: "m1", sessionId: "s1" });
  t = 2000; // past expiry
  expect(store.consume(nonce, "m1").ok).toBe(false);
});

test("SlackChannel: a replayed click on an already-approved request is denied", async () => {
  const interactions = new InMemoryInteractionSource();
  const channel = new SlackChannel({
    transport: new NoopTransport(),
    interactions,
    channelId: "C1",
    nonceStore: new NonceStore({ gen: () => "n1" }),
  });
  const handle = await channel.postApprovalRequest(validApprovalRequest);
  interactions.push({ nonce: "n1", approved: true, userId: "U", isBot: false });

  // first real approval consumes the nonce
  expect((await channel.awaitDecision(handle)).approved).toBe(true);
  // a replay of the same click is rejected (nonce already used) → not approved
  expect((await channel.awaitDecision(handle)).approved).toBe(false);
});
