import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { Daemon } from "./daemon.ts";
import { Journal, readEvents } from "../journal/journal.ts";
import { verifyJournalFile } from "../journal/verify.ts";
import { PolicyEngine, type PolicyRule } from "../policy/engine.ts";
import { RecordingSandbox } from "../runtime/sandbox.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { ScriptedIntendant } from "../runtime/intendant.ts";
import { generateSigningKeyPem, loadPrivateKey, publicKeyFromPrivate } from "../runtime/crypto.ts";
import type { ChannelAdapter } from "../contracts/channel-adapter.ts";

interface Harness {
  dir: string;
  path: string;
  pub: KeyObject;
  daemon: Daemon;
  sandbox: RecordingSandbox;
}

function harness(rules: PolicyRule[], env: Record<string, string | undefined> = {}): Harness {
  const dir = mkdtempSync(join(tmpdir(), "agp-dmn-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-06-02T00:00:00.000Z");
  const sandbox = new RecordingSandbox();
  const daemon = new Daemon({
    policy: new PolicyEngine(rules),
    journal,
    sandbox,
    channel: new ConsoleChannel(env, () => {}),
  });
  return { dir, path, pub: publicKeyFromPrivate(priv), daemon, sandbox };
}

test("an allowed tool call is executed, journaled, and the journal verifies", async () => {
  const h = harness([
    { id: "allow-read", effect: "allow", tool: "Read" },
    { id: "deny-bash", effect: "deny", tool: "Bash" },
  ]);
  const res = await h.daemon.runScripted(new ScriptedIntendant([{ tool: "Read", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes).toHaveLength(1);
  expect(res.outcomes[0]!.verdict.decision).toBe("allow");
  expect(res.outcomes[0]!.executed).toBe(true);
  expect(h.sandbox.recorded).toHaveLength(1);
  expect(verifyJournalFile(h.path, h.pub).ok).toBe(true);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a denied tool call is NOT executed (the dangerous default path)", async () => {
  const h = harness([{ id: "deny-bash", effect: "deny", tool: "Bash" }]);
  const res = await h.daemon.runScripted(new ScriptedIntendant([{ tool: "Bash", args: { command: "rm -rf /" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes[0]!.verdict.decision).toBe("deny");
  expect(res.outcomes[0]!.executed).toBe(false);
  expect(h.sandbox.recorded).toHaveLength(0);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a 'require' call is denied by the fail-closed console channel (no human)", async () => {
  const h = harness([{ id: "req-write", effect: "require", tool: "Write" }]); // AGP_AUTO_APPROVE unset
  const res = await h.daemon.runScripted(new ScriptedIntendant([{ tool: "Write", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes[0]!.verdict.decision).toBe("require");
  expect(res.outcomes[0]!.approved).toBe(false);
  expect(res.outcomes[0]!.executed).toBe(false);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a 'require' call executes only once a human approves", async () => {
  const h = harness([{ id: "req-write", effect: "require", tool: "Write" }], { AGP_AUTO_APPROVE: "1" });
  const res = await h.daemon.runScripted(new ScriptedIntendant([{ tool: "Write", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes[0]!.approved).toBe(true);
  expect(res.outcomes[0]!.executed).toBe(true);
  expect(h.sandbox.recorded).toHaveLength(1);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a 'require' call fails closed (deny) when the channel cannot get a decision", async () => {
  // A receiver timeout / socket drop makes awaitDecision reject. The loop MUST
  // fail closed (deny, not executed, not crash) and journal the reason.
  const dir = mkdtempSync(join(tmpdir(), "agp-dmn-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-06-02T00:00:00.000Z");
  const throwingChannel: ChannelAdapter = {
    postApprovalRequest: (req) => Promise.resolve({ messageId: req.messageId }),
    awaitDecision: () => Promise.reject(new Error("approval timed out for nonce n1")),
    projectEvent: () => Promise.resolve(true),
  };
  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "req-write", effect: "require", tool: "Write" }]),
    journal,
    sandbox: new RecordingSandbox(),
    channel: throwingChannel,
  });
  const res = await daemon.runScripted(new ScriptedIntendant([{ tool: "Write", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes[0]!.approved).toBe(false);
  expect(res.outcomes[0]!.executed).toBe(false);
  const denied = readEvents(path).find((e) => e.kind === "approval.denied");
  expect(String(denied?.payload.reason)).toContain("no decision");
  expect(verifyJournalFile(path, publicKeyFromPrivate(priv)).ok).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test("runScripted brackets the session with started/ended journal events", async () => {
  const h = harness([{ id: "allow-all", effect: "allow", tool: "*" }]);
  await h.daemon.runScripted(new ScriptedIntendant([{ tool: "Read", args: {} }]), { sessionId: "s1" });
  const kinds = readEvents(h.path).map((e) => e.kind);
  expect(kinds[0]).toBe("session.started");
  expect(kinds[kinds.length - 1]).toBe("session.ended");
  rmSync(h.dir, { recursive: true, force: true });
});
