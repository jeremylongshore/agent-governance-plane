import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Daemon } from "../../daemon/daemon.ts";
import { Journal, readEvents } from "../../journal/journal.ts";
import { verifyJournalFile } from "../../journal/verify.ts";
import { PolicyEngine } from "../../policy/engine.ts";
import { RecordingSandbox } from "../../runtime/sandbox.ts";
import { generateSigningKeyPem, loadPrivateKey, publicKeyFromPrivate } from "../../runtime/crypto.ts";
import { SlackChannel } from "../../channels/slack/slack-channel.ts";
import { NonceStore } from "../../channels/slack/nonce-store.ts";
import { InMemoryInteractionSource } from "../../channels/slack/interactions.ts";
import type { SlackTransport, PostResult } from "../../channels/slack/transport.ts";
import type { SlackBlock } from "../../channels/slack/blocks.ts";
import { validApprovalRequest } from "../../contracts/fixtures.ts";
import { ClaudeCodeIntendant } from "../claude-code/claude-code-intendant.ts";
import { InMemoryClaudeProcess } from "../claude-code/claude-process.ts";
import { CodexIntendant } from "./codex-intendant.ts";
import { InMemoryCodexProcess } from "./codex-process.ts";

// agp-cln.3: two concurrent sessions (one Claude, one Codex) share ONE Slack
// channel with NO echo loop and NO cross-session approval bleed. This PROVES the
// existing sessionId binding + nonce + peer-bot guards hold across two harnesses;
// it adds no new isolation.

class FakeSlackTransport implements SlackTransport {
  readonly posts: { channel: string; text: string }[] = [];
  postMessage(channel: string, _blocks: SlackBlock[], text: string): Promise<PostResult> {
    this.posts.push({ channel, text });
    return Promise.resolve({ ts: `ts-${this.posts.length}` });
  }
  updateMessage(): Promise<void> {
    return Promise.resolve();
  }
}

const WRITE = [{ tool: "Write", args: { path: "/work/x.ts", content: "x" } }];

function daemonOn(channel: SlackChannel) {
  const dir = mkdtempSync(join(tmpdir(), "agp-conc-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-06-21T00:00:00.000Z");
  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "req-write", effect: "require", tool: "Write" }]),
    journal,
    sandbox: new RecordingSandbox(),
    channel,
  });
  return { dir, path, daemon, pub: publicKeyFromPrivate(priv) };
}

test("two harnesses run concurrent sessions in one channel; each session's journal is independent and verifies", async () => {
  // One shared channel for both sessions; both approval nonces pre-seeded human-approve.
  const interactions = new InMemoryInteractionSource();
  interactions.push({ nonce: "n1", approved: true, userId: "U-op", isBot: false });
  interactions.push({ nonce: "n2", approved: true, userId: "U-op", isBot: false });
  let i = 0;
  const channel = new SlackChannel({
    transport: new FakeSlackTransport(),
    interactions,
    channelId: "C1",
    nonceStore: new NonceStore({ gen: () => `n${++i}` }),
  });

  const claude = daemonOn(channel);
  const codex = daemonOn(channel);

  const [rc, rx] = await Promise.all([
    claude.daemon.runLive(new ClaudeCodeIntendant(new InMemoryClaudeProcess(WRITE)), { sessionId: "claude-sess" }),
    codex.daemon.runLive(new CodexIntendant(new InMemoryCodexProcess(WRITE)), { sessionId: "codex-sess" }),
  ]);

  // Both sessions were approved through the shared channel.
  expect(rc.outcomes[0]!.approved).toBe(true);
  expect(rx.outcomes[0]!.approved).toBe(true);

  // Each journal contains ONLY its own session's events (no cross-session bleed),
  // and each verifies independently.
  for (const [run, sid] of [
    [claude, "claude-sess"],
    [codex, "codex-sess"],
  ] as const) {
    const events = readEvents(run.path);
    const sids = new Set(events.map((e) => (e.payload as { sessionId?: string }).sessionId).filter(Boolean));
    expect([...sids]).toEqual([sid]); // this journal saw only its own session
    expect(events.map((e) => e.kind)).toContain("approval.granted");
    expect(verifyJournalFile(run.path, run.pub).ok).toBe(true);
    rmSync(run.dir, { recursive: true, force: true });
  }
});

test("echo-loop + non-bleed guards hold per (messageId, sessionId): bot rejected without burning the nonce, one-time consume", async () => {
  const interactions = new InMemoryInteractionSource();
  let i = 0;
  const nonceStore = new NonceStore({ gen: () => `n${++i}` });
  const channel = new SlackChannel({ transport: new FakeSlackTransport(), interactions, channelId: "C1", nonceStore });

  // Two distinct prompts — one per session — each nonce-bound to its own pair.
  const hA = await channel.postApprovalRequest({ ...validApprovalRequest, messageId: "mA", sessionId: "sA" });
  const hB = await channel.postApprovalRequest({ ...validApprovalRequest, messageId: "mB", sessionId: "sB" });
  expect(hA.messageId).toBe("mA");
  expect(hB.messageId).toBe("mB");

  // Echo loop: a bot/peer-app "approval" on B's nonce is rejected AND does NOT
  // consume the nonce — so a human can still act on B afterward.
  interactions.push({ nonce: "n2", approved: true, userId: "B-bot", isBot: true });
  const botDecision = await channel.awaitDecision(hB);
  expect(botDecision.approved).toBe(false);
  expect(nonceStore.consume("n2", "mB").ok).toBe(true); // nonce survived the bot attempt

  // A human approval on A's nonce settles A only; replaying that nonce is rejected.
  expect(nonceStore.consume("n1", "mA").ok).toBe(true);
  expect(nonceStore.consume("n1", "mA").ok).toBe(false); // one-time: replay rejected
  // Cross-session: A's nonce can never be consumed for B's messageId (binding).
  expect(nonceStore.consume("n2", "mA").ok).toBe(false);
});
