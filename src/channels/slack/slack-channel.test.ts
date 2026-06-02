import { test, expect } from "bun:test";
import { SlackChannel } from "./slack-channel.ts";
import { NonceStore } from "./nonce-store.ts";
import { InMemoryInteractionSource, type SlackInteraction } from "./interactions.ts";
import type { SlackTransport, PostResult } from "./transport.ts";
import type { SlackBlock } from "./blocks.ts";
import { ACTION_APPROVE, ACTION_DENY } from "./blocks.ts";
import { validApprovalRequest } from "../../contracts/fixtures.ts";

class FakeSlackTransport implements SlackTransport {
  readonly posts: { channel: string; blocks: SlackBlock[]; text: string }[] = [];
  readonly updates: { ts: string; text: string }[] = [];
  failPost = false;
  postMessage(channel: string, blocks: SlackBlock[], text: string): Promise<PostResult> {
    if (this.failPost) return Promise.reject(new Error("slack unavailable"));
    this.posts.push({ channel, blocks, text });
    return Promise.resolve({ ts: `ts-${this.posts.length}` });
  }
  updateMessage(_channel: string, ts: string, text: string): Promise<void> {
    this.updates.push({ ts, text });
    return Promise.resolve();
  }
}

function setup(): {
  transport: FakeSlackTransport;
  interactions: InMemoryInteractionSource;
  nonceStore: NonceStore;
  channel: SlackChannel;
} {
  const transport = new FakeSlackTransport();
  const interactions = new InMemoryInteractionSource();
  let i = 0;
  const nonceStore = new NonceStore({ gen: () => `n${++i}` });
  const channel = new SlackChannel({ transport, interactions, channelId: "C1", nonceStore });
  return { transport, interactions, nonceStore, channel };
}

const human = (nonce: string, approved: boolean): SlackInteraction => ({
  nonce,
  approved,
  userId: "U-operator",
  isBot: false,
});

test("postApprovalRequest posts a nonce-bound Block Kit prompt with Approve/Deny", async () => {
  const { transport, channel } = setup();
  const handle = await channel.postApprovalRequest(validApprovalRequest);
  expect(handle.messageId).toBe(validApprovalRequest.messageId);

  const actions = transport.posts[0]!.blocks.find((b) => b.type === "actions") as Record<string, unknown>;
  const elements = actions.elements as Array<Record<string, unknown>>;
  expect(elements.map((e) => e.action_id)).toEqual([ACTION_APPROVE, ACTION_DENY]);
  // both buttons carry the same nonce (n1), binding the click to this request
  expect(elements[0]!.value).toBe("n1");
  expect(elements[1]!.value).toBe("n1");
});

test("a human Approve click yields an approved decision", async () => {
  const { interactions, channel } = setup();
  const handle = await channel.postApprovalRequest(validApprovalRequest);
  interactions.push(human("n1", true));
  const decision = await channel.awaitDecision(handle);
  expect(decision.approved).toBe(true);
  expect(decision.decidedBy).toBe("U-operator");
});

test("a human Deny click yields a denied decision", async () => {
  const { interactions, channel } = setup();
  const handle = await channel.postApprovalRequest(validApprovalRequest);
  interactions.push(human("n1", false));
  expect((await channel.awaitDecision(handle)).approved).toBe(false);
});

test("a peer bot cannot approve, and does not burn the nonce", async () => {
  const { interactions, nonceStore, channel } = setup();
  const handle = await channel.postApprovalRequest(validApprovalRequest);
  interactions.push({ nonce: "n1", approved: true, userId: "B-bot", isBot: true });
  const decision = await channel.awaitDecision(handle);
  expect(decision.approved).toBe(false);
  // nonce was NOT consumed by the bot attempt — a human could still act on it
  expect(nonceStore.consume("n1", validApprovalRequest.messageId).ok).toBe(true);
});

test("projectEvent is best-effort: returns true on success, false on failure, never throws", async () => {
  const { transport, channel } = setup();
  expect(await channel.projectEvent("tool_call.allow", "Read /x")).toBe(true);
  transport.failPost = true;
  expect(await channel.projectEvent("tool_call.deny", "Bash blocked")).toBe(false);
});
