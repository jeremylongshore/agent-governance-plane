import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { Daemon } from "../../daemon/daemon.ts";
import { Journal } from "../../journal/journal.ts";
import { verifyJournalFile } from "../../journal/verify.ts";
import { readEvents } from "../../journal/journal.ts";
import { PolicyEngine, type PolicyRule } from "../../policy/engine.ts";
import { RecordingSandbox } from "../../runtime/sandbox.ts";
import { ConsoleChannel } from "../../runtime/channel.ts";
import { generateSigningKeyPem, loadPrivateKey, publicKeyFromPrivate } from "../../runtime/crypto.ts";
import { ClaudeCodeSprite } from "./claude-code-sprite.ts";
import { InMemoryClaudeProcess, type HookDecision } from "./claude-process.ts";
import { buildHookSettings, buildClaudeArgs, BunClaudeProcess } from "./bun-claude-process.ts";

interface Harness {
  dir: string;
  path: string;
  pub: KeyObject;
  daemon: Daemon;
  sandbox: RecordingSandbox;
}

function harness(rules: PolicyRule[], env: Record<string, string | undefined> = {}): Harness {
  const dir = mkdtempSync(join(tmpdir(), "agp-cc-"));
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

const FOUR_TOOLS = [
  { tool: "Read", args: { path: "/work/a.ts" } },
  { tool: "Write", args: { path: "/work/b.ts", content: "x" } },
  { tool: "Bash", args: { command: "git status" } },
  { tool: "Bash", args: { command: "git push --force" } },
];

test("read/write/shell/git calls each pass through the gate and are journaled, gate-only (no proxy-exec)", async () => {
  const h = harness([
    { id: "allow-read", effect: "allow", tool: "Read" },
    { id: "allow-write", effect: "allow", tool: "Write" },
    { id: "allow-bash", effect: "allow", tool: "Bash" },
  ]);
  const proc = new InMemoryClaudeProcess(FOUR_TOOLS);
  const res = await h.daemon.runLive(new ClaudeCodeSprite(proc), { sessionId: "s1" });

  expect(res.outcomes).toHaveLength(4);
  expect(res.outcomes.map((o) => o.request.tool)).toEqual(["Read", "Write", "Bash", "Bash"]);
  // Gate-only: the harness executes its own tools — AGP never proxy-executes.
  expect(res.outcomes.every((o) => o.executed === false)).toBe(true);
  expect(h.sandbox.recorded).toHaveLength(0);
  // The harness received an allow decision for every call (back-pressure settled).
  expect(proc.responses.map((r) => r.decision.allow)).toEqual([true, true, true, true]);
  // Every gate decision is in the signed journal, and the chain verifies.
  const kinds = readEvents(h.path).map((e) => e.kind);
  expect(kinds.filter((k) => k === "gate.allow")).toHaveLength(4);
  expect(verifyJournalFile(h.path, h.pub).ok).toBe(true);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a denied call is blocked: the hook receives allow=false with the reason, harness keeps running", async () => {
  const h = harness([
    { id: "allow-read", effect: "allow", tool: "Read" },
    { id: "deny-bash", effect: "deny", tool: "Bash", reason: "no shell in this session" },
  ]);
  const proc = new InMemoryClaudeProcess([
    { tool: "Read", args: { path: "/work/a.ts" } },
    { tool: "Bash", args: { command: "rm -rf /" } },
    { tool: "Read", args: { path: "/work/c.ts" } },
  ]);
  const res = await h.daemon.runLive(new ClaudeCodeSprite(proc), { sessionId: "s1" });

  expect(res.outcomes.map((o) => o.verdict.decision)).toEqual(["allow", "deny", "allow"]);
  const denied = proc.responses[1]!.decision as Exclude<HookDecision, { allow: true }>;
  expect(denied.allow).toBe(false);
  expect(denied.reason).toBe("no shell in this session");
  // The denial did not crash the harness — the third call still ran.
  expect(proc.responses).toHaveLength(3);
  expect(readEvents(h.path).map((e) => e.kind)).toContain("gate.deny");
  rmSync(h.dir, { recursive: true, force: true });
});

test("an unmatched call is default-denied (fail-closed) at the gate", async () => {
  const h = harness([{ id: "allow-read", effect: "allow", tool: "Read" }]);
  const proc = new InMemoryClaudeProcess([{ tool: "WebFetch", args: { url: "http://x" } }]);
  const res = await h.daemon.runLive(new ClaudeCodeSprite(proc), { sessionId: "s1" });
  expect(res.outcomes[0]!.verdict.decision).toBe("deny");
  expect((proc.responses[0]!.decision as { allow: boolean }).allow).toBe(false);
  rmSync(h.dir, { recursive: true, force: true });
});

test("a 'require' call is approved by a human channel, and the hook is then allowed", async () => {
  const h = harness([{ id: "req-write", effect: "require", tool: "Write" }], { AGP_AUTO_APPROVE: "1" });
  const proc = new InMemoryClaudeProcess([{ tool: "Write", args: { path: "/work/b.ts", content: "x" } }]);
  const res = await h.daemon.runLive(new ClaudeCodeSprite(proc), { sessionId: "s1" });

  expect(res.outcomes[0]!.verdict.decision).toBe("require");
  expect(res.outcomes[0]!.approved).toBe(true);
  expect((proc.responses[0]!.decision as { allow: boolean }).allow).toBe(true);
  const kinds = readEvents(h.path).map((e) => e.kind);
  expect(kinds).toContain("approval.granted");
  expect(kinds).toContain("gate.allow");
  rmSync(h.dir, { recursive: true, force: true });
});

test("a 'require' call is denied by the fail-closed channel when no human is present", async () => {
  const h = harness([{ id: "req-write", effect: "require", tool: "Write" }]); // AGP_AUTO_APPROVE unset
  const proc = new InMemoryClaudeProcess([{ tool: "Write", args: { path: "/work/b.ts", content: "x" } }]);
  const res = await h.daemon.runLive(new ClaudeCodeSprite(proc), { sessionId: "s1" });
  expect(res.outcomes[0]!.approved).toBe(false);
  expect((proc.responses[0]!.decision as { allow: boolean }).allow).toBe(false);
  rmSync(h.dir, { recursive: true, force: true });
});

test("stop() terminates the session: pending hooks unblock as denied and remaining calls do not run", async () => {
  // A process that emits one call, waits forever for a verdict, then would emit more.
  const handler = { fn: null as ((d: HookDecision) => void) | null };
  const proc = new InMemoryClaudeProcess([{ tool: "Read", args: {} }]);
  const sprite = new ClaudeCodeSprite(proc);
  // Register a handler that never responds — simulating a stuck gate — then stop.
  sprite.onToolCall(() => {
    /* swallow: never deliver a verdict, leaving the hook blocked */
  });
  await sprite.start("s1");
  const running = sprite.run("s1");
  // Give the emit a tick, then terminate.
  await Promise.resolve();
  await sprite.stop();
  await running; // resolves because stop() unblocked the pending hook as denied
  expect(proc.responses[0]!.decision.allow).toBe(false);
  void handler;
});

test("run(sessionId) must match the started session", async () => {
  const sprite = new ClaudeCodeSprite(new InMemoryClaudeProcess([]));
  await sprite.start("s1");
  await expect(sprite.run("s2")).rejects.toThrow(/does not match/);
});

test("BunClaudeProcess builders are pure and login-session based (no API key)", () => {
  const settings = buildHookSettings("/usr/local/bin/agp-hook-bridge --socket /tmp/s.sock");
  expect(settings.hooks.PreToolUse[0]!.matcher).toBe("*");
  expect(settings.hooks.PreToolUse[0]!.hooks[0]!.command).toContain("agp-hook-bridge");

  const argv = buildClaudeArgs({ task: "fix the bug", settingsPath: "/tmp/settings.json" });
  expect(argv[0]).toBe("claude");
  expect(argv).toContain("--settings");
  expect(argv).toContain("fix the bug");
  expect(argv.join(" ")).not.toContain("--api-key"); // reuses the login session
});

test("BunClaudeProcess live spawn is gated behind AGP_CLAUDE_LIVE", async () => {
  const proc = new BunClaudeProcess({
    task: "x",
    repoPath: "/work",
    bridgeSocket: "/tmp/s.sock",
    env: {}, // AGP_CLAUDE_LIVE unset
  });
  await expect(proc.start("s1")).rejects.toThrow(/gated/);
});
