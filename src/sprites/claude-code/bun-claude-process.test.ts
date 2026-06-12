import { test, expect } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunClaudeProcess, buildBridgeCommand } from "./bun-claude-process.ts";
import { GatewayClient } from "../../gateway/client.ts";
import type { PreToolUseEvent } from "./claude-process.ts";

function freshSocket(): string {
  return join(mkdtempSync(join(tmpdir(), "agp-bcp-")), "gate.sock");
}

const LIVE = { AGP_CLAUDE_LIVE: "1" };

test("buildBridgeCommand points the hook at `agp bridge` on the session socket", () => {
  const cmd = buildBridgeCommand("/tmp/s.sock", "/usr/bin/bun");
  expect(cmd).toContain("bridge --socket");
  expect(cmd).toContain("/tmp/s.sock");
  expect(cmd).toContain("/usr/bin/bun");
});

test("a bridge request surfaces as a PreToolUse event and respond(allow) returns an allow verdict", async () => {
  const socketPath = freshSocket();
  const proc = new BunClaudeProcess({ task: "t", repoPath: "/tmp", bridgeSocket: socketPath, env: LIVE });
  const events: PreToolUseEvent[] = [];
  // Respond inline so the correlation is deterministic (no sleeps).
  proc.onPreToolUse((ev) => {
    events.push(ev);
    proc.respond(ev.callId, { allow: true });
  });
  await proc.start("s1");

  const client = new GatewayClient({ socketPath });
  await client.connect();
  const res = await client.request({
    kind: "tool_call_request",
    id: "call-1",
    sessionId: "s1",
    tool: "Read",
    args: { path: "/x" },
    actor: "claude_process",
  });

  expect(events).toEqual([{ callId: "call-1", tool: "Read", args: { path: "/x" } }]);
  expect(res.kind).toBe("policy_verdict");
  expect(res.kind === "policy_verdict" && res.verdict.decision).toBe("allow");
  await client.close();
  await proc.stop();
});

test("respond(deny) returns a deny verdict carrying the reason", async () => {
  const socketPath = freshSocket();
  const proc = new BunClaudeProcess({ task: "t", repoPath: "/tmp", bridgeSocket: socketPath, env: LIVE });
  proc.onPreToolUse((ev) => proc.respond(ev.callId, { allow: false, reason: "rm is blocked" }));
  await proc.start("s1");

  const client = new GatewayClient({ socketPath });
  await client.connect();
  const res = await client.request({
    kind: "tool_call_request",
    id: "call-2",
    sessionId: "s1",
    tool: "Bash",
    args: { command: "rm -rf /" },
    actor: "claude_process",
  });
  expect(res.kind === "policy_verdict" && res.verdict.decision).toBe("deny");
  expect(res.kind === "policy_verdict" && res.verdict.reason).toBe("rm is blocked");
  await client.close();
  await proc.stop();
});

test("with no gate handler registered, the bridge request fails closed (error)", async () => {
  const socketPath = freshSocket();
  const proc = new BunClaudeProcess({ task: "t", repoPath: "/tmp", bridgeSocket: socketPath, env: LIVE });
  // intentionally do NOT register onPreToolUse
  await proc.start("s1");
  const client = new GatewayClient({ socketPath });
  await client.connect();
  const res = await client.request({
    kind: "tool_call_request",
    id: "call-3",
    sessionId: "s1",
    tool: "Read",
    args: {},
    actor: "claude_process",
  });
  expect(res.kind).toBe("error");
  await client.close();
  await proc.stop();
});

test("run spawns claude (injected) with the bridge settings + argv, then awaits exit", async () => {
  const socketPath = freshSocket();
  let launched: { argv: string[]; cwd: string } | null = null;
  const proc = new BunClaudeProcess({
    task: "fix the flake",
    repoPath: "/tmp/ccsc",
    bridgeSocket: socketPath,
    env: LIVE,
    launch: (argv, cwd) => {
      launched = { argv, cwd };
      return { exited: Promise.resolve(0), kill: () => {} };
    },
  });
  proc.onPreToolUse(() => {});
  await proc.start("s9");
  await proc.run();

  expect(launched).not.toBeNull();
  const got = launched as unknown as { argv: string[]; cwd: string };
  expect(got.cwd).toBe("/tmp/ccsc");
  expect(got.argv[0]).toBe("claude");
  expect(got.argv).toContain("fix the flake");

  const settingsPath = join(tmpdir(), "agp-s9-settings.json");
  expect(existsSync(settingsPath)).toBe(true);
  const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
    hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
  };
  expect(settings.hooks.PreToolUse[0]!.hooks[0]!.command).toContain("bridge --socket");
  await proc.stop();
});

test("stop fails closed on a pending hook and closes the socket (no hang)", async () => {
  const socketPath = freshSocket();
  const proc = new BunClaudeProcess({ task: "t", repoPath: "/tmp", bridgeSocket: socketPath, env: LIVE });
  proc.onPreToolUse(() => {
    /* never respond — simulate a call in flight at shutdown */
  });
  await proc.start("s1");
  const client = new GatewayClient({ socketPath, timeoutMs: 3000 });
  await client.connect();
  const pending = client.request({
    kind: "tool_call_request",
    id: "call-4",
    sessionId: "s1",
    tool: "Bash",
    args: {},
    actor: "claude_process",
  });
  await Bun.sleep(15); // let the request register as pending
  await proc.stop();
  // Either a deny verdict arrives or the connection closes — both are fail-closed.
  const settled = await pending.then(
    (r) => (r.kind === "policy_verdict" ? r.verdict.decision : r.kind),
    () => "closed",
  );
  expect(["deny", "closed"]).toContain(settled);
  await client.close();
});
