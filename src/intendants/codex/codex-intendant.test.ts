import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { Daemon } from "../../daemon/daemon.ts";
import { Journal, readEvents } from "../../journal/journal.ts";
import { verifyJournalFile } from "../../journal/verify.ts";
import { PolicyEngine, type PolicyRule } from "../../policy/engine.ts";
import { RecordingSandbox } from "../../runtime/sandbox.ts";
import { ConsoleChannel } from "../../runtime/channel.ts";
import { generateSigningKeyPem, loadPrivateKey, publicKeyFromPrivate } from "../../runtime/crypto.ts";
import { CodexIntendant, normalizeCodexEvent } from "./codex-intendant.ts";
import { InMemoryCodexProcess, type CodexDecision } from "./codex-process.ts";

interface Harness {
  dir: string;
  path: string;
  pub: KeyObject;
  daemon: Daemon;
  sandbox: RecordingSandbox;
}

function harness(rules: PolicyRule[], env: Record<string, string | undefined> = {}): Harness {
  const dir = mkdtempSync(join(tmpdir(), "agp-cx-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-06-21T00:00:00.000Z");
  const sandbox = new RecordingSandbox();
  const daemon = new Daemon({ policy: new PolicyEngine(rules), journal, sandbox, channel: new ConsoleChannel(env, () => {}) });
  return { dir, path, pub: publicKeyFromPrivate(priv), daemon, sandbox };
}

const FOUR_TOOLS = [
  { tool: "Read", args: { path: "/work/a.ts" } },
  { tool: "Write", args: { path: "/work/b.ts", content: "x" } },
  { tool: "Bash", args: { command: "git status" } },
  { tool: "Bash", args: { command: "git push --force" } },
];

test("normalizeCodexEvent maps Codex's native shape to a ToolCallRequest with the agent-process actor", () => {
  const req = normalizeCodexEvent({ id: "s1-call-1", name: "Read", arguments: { path: "/x" } }, "s1");
  expect(req).toEqual({
    kind: "tool_call_request",
    id: "s1-call-1",
    sessionId: "s1",
    tool: "Read",
    args: { path: "/x" },
    actor: "claude_process", // the only agent-process actor in the frozen enum — never codex_process
  });
});

test("read/write/shell/git each pass the gate, gate-only (no proxy-exec), and are journaled", async () => {
  const h = harness([
    { id: "allow-read", effect: "allow", tool: "Read" },
    { id: "allow-write", effect: "allow", tool: "Write" },
    { id: "allow-bash", effect: "allow", tool: "Bash" },
  ]);
  const proc = new InMemoryCodexProcess(FOUR_TOOLS);
  const res = await h.daemon.runLive(new CodexIntendant(proc), { sessionId: "s1" });

  expect(res.outcomes.map((o) => o.request.tool)).toEqual(["Read", "Write", "Bash", "Bash"]);
  expect(res.outcomes.every((o) => o.executed === false)).toBe(true);
  expect(h.sandbox.recorded).toHaveLength(0);
  expect(proc.responses.map((r) => r.decision.allow)).toEqual([true, true, true, true]);
  expect(readEvents(h.path).filter((e) => e.kind === "gate.allow")).toHaveLength(4);
  expect(verifyJournalFile(h.path, h.pub).ok).toBe(true);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a denied call blocks: the harness receives allow=false + reason and keeps running", async () => {
  const h = harness([
    { id: "allow-read", effect: "allow", tool: "Read" },
    { id: "deny-bash", effect: "deny", tool: "Bash", reason: "no shell in this session" },
  ]);
  const proc = new InMemoryCodexProcess([
    { tool: "Read", args: { path: "/work/a.ts" } },
    { tool: "Bash", args: { command: "rm -rf /" } },
    { tool: "Read", args: { path: "/work/c.ts" } },
  ]);
  const res = await h.daemon.runLive(new CodexIntendant(proc), { sessionId: "s1" });

  expect(res.outcomes.map((o) => o.verdict.decision)).toEqual(["allow", "deny", "allow"]);
  const denied = proc.responses[1]!.decision as Exclude<CodexDecision, { allow: true }>;
  expect(denied.allow).toBe(false);
  expect(denied.reason).toBe("no shell in this session");
  expect(proc.responses).toHaveLength(3);
  expect(readEvents(h.path).map((e) => e.kind)).toContain("gate.deny");
  rmSync(h.dir, { recursive: true, force: true });
});

test("an unmatched call is default-denied (fail-closed) at the gate", async () => {
  const h = harness([{ id: "allow-read", effect: "allow", tool: "Read" }]);
  const proc = new InMemoryCodexProcess([{ tool: "WebFetch", args: { url: "http://x" } }]);
  const res = await h.daemon.runLive(new CodexIntendant(proc), { sessionId: "s1" });
  expect(res.outcomes[0]!.verdict.decision).toBe("deny");
  expect((proc.responses[0]!.decision as { allow: boolean }).allow).toBe(false);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a 'require' call approved by the channel allows the harness", async () => {
  const h = harness([{ id: "req-write", effect: "require", tool: "Write" }], { AGP_AUTO_APPROVE: "1" });
  const proc = new InMemoryCodexProcess([{ tool: "Write", args: { path: "/work/b.ts", content: "x" } }]);
  const res = await h.daemon.runLive(new CodexIntendant(proc), { sessionId: "s1" });

  expect(res.outcomes[0]!.verdict.decision).toBe("require");
  expect(res.outcomes[0]!.approved).toBe(true);
  expect((proc.responses[0]!.decision as { allow: boolean }).allow).toBe(true);
  const kinds = readEvents(h.path).map((e) => e.kind);
  expect(kinds).toContain("approval.granted");
  expect(kinds).toContain("gate.allow");
  rmSync(h.dir, { recursive: true, force: true });
});

test("a 'require' call is fail-closed denied when no human is present", async () => {
  const h = harness([{ id: "req-write", effect: "require", tool: "Write" }]);
  const proc = new InMemoryCodexProcess([{ tool: "Write", args: { path: "/work/b.ts", content: "x" } }]);
  const res = await h.daemon.runLive(new CodexIntendant(proc), { sessionId: "s1" });
  expect(res.outcomes[0]!.approved).toBe(false);
  expect((proc.responses[0]!.decision as { allow: boolean }).allow).toBe(false);
  rmSync(h.dir, { recursive: true, force: true });
});

test("stop() terminates: a pending call unblocks as denied and remaining calls do not run", async () => {
  const proc = new InMemoryCodexProcess([{ tool: "Read", args: {} }]);
  const intendant = new CodexIntendant(proc);
  intendant.onToolCall(() => {
    /* never deliver a verdict — leave the call blocked */
  });
  await intendant.start("s1");
  const running = intendant.run("s1");
  await Promise.resolve();
  await intendant.stop();
  await running;
  expect(proc.responses[0]!.decision.allow).toBe(false);
});

test("run(sessionId) must match the started session", async () => {
  const intendant = new CodexIntendant(new InMemoryCodexProcess([]));
  await intendant.start("s1");
  await expect(intendant.run("s2")).rejects.toThrow(/does not match/);
});
