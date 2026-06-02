import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { Daemon } from "./daemon.ts";
import { RefJournal, verifyJournal, readEvents } from "../runtime/journal.ts";
import { RefPolicyEvaluator, type PolicyRule } from "../runtime/policy.ts";
import { RecordingSandbox } from "../runtime/sandbox.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { ScriptedSprite } from "../runtime/sprite.ts";
import { generateSigningKeyPem, loadPrivateKey, publicKeyFromPrivate } from "../runtime/crypto.ts";

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
  const journal = new RefJournal(path, priv, () => "2026-06-02T00:00:00.000Z");
  const sandbox = new RecordingSandbox();
  const daemon = new Daemon({
    policy: new RefPolicyEvaluator(rules),
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
  const res = await h.daemon.runScripted(new ScriptedSprite([{ tool: "Read", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes).toHaveLength(1);
  expect(res.outcomes[0]!.verdict.decision).toBe("allow");
  expect(res.outcomes[0]!.executed).toBe(true);
  expect(h.sandbox.recorded).toHaveLength(1);
  expect(verifyJournal(h.path, h.pub).ok).toBe(true);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a denied tool call is NOT executed (the dangerous default path)", async () => {
  const h = harness([{ id: "deny-bash", effect: "deny", tool: "Bash" }]);
  const res = await h.daemon.runScripted(new ScriptedSprite([{ tool: "Bash", args: { command: "rm -rf /" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes[0]!.verdict.decision).toBe("deny");
  expect(res.outcomes[0]!.executed).toBe(false);
  expect(h.sandbox.recorded).toHaveLength(0);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a 'require' call is denied by the fail-closed console channel (no human)", async () => {
  const h = harness([{ id: "req-write", effect: "require", tool: "Write" }]); // AGP_AUTO_APPROVE unset
  const res = await h.daemon.runScripted(new ScriptedSprite([{ tool: "Write", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes[0]!.verdict.decision).toBe("require");
  expect(res.outcomes[0]!.approved).toBe(false);
  expect(res.outcomes[0]!.executed).toBe(false);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a 'require' call executes only once a human approves", async () => {
  const h = harness([{ id: "req-write", effect: "require", tool: "Write" }], { AGP_AUTO_APPROVE: "1" });
  const res = await h.daemon.runScripted(new ScriptedSprite([{ tool: "Write", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes[0]!.approved).toBe(true);
  expect(res.outcomes[0]!.executed).toBe(true);
  expect(h.sandbox.recorded).toHaveLength(1);
  rmSync(h.dir, { recursive: true, force: true });
});

test("runScripted brackets the session with started/ended journal events", async () => {
  const h = harness([{ id: "allow-all", effect: "allow", tool: "*" }]);
  await h.daemon.runScripted(new ScriptedSprite([{ tool: "Read", args: {} }]), { sessionId: "s1" });
  const kinds = readEvents(h.path).map((e) => e.kind);
  expect(kinds[0]).toBe("session.started");
  expect(kinds[kinds.length - 1]).toBe("session.ended");
  rmSync(h.dir, { recursive: true, force: true });
});
