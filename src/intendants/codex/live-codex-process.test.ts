import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LiveCodexProcess, buildCodexArgv } from "./live-codex-process.ts";
import { GatewayClient } from "../../gateway/client.ts";
import type { CodexToolEvent } from "./codex-process.ts";

const LIVE = { AGP_CODEX_LIVE: "1" };

function freshSocket(): string {
  return join(mkdtempSync(join(tmpdir(), "agp-lcx-")), "gate.sock");
}

test("buildCodexArgv is pure and reuses the operator's Codex auth (no --api-key)", () => {
  const argv = buildCodexArgv({ task: "fix the flake" });
  expect(argv).toEqual(["codex", "exec", "fix the flake"]);
  expect(argv.join(" ")).not.toContain("--api-key");
  expect(buildCodexArgv({ task: "t", codexBin: "/usr/local/bin/codex" })[0]).toBe("/usr/local/bin/codex");
});

test("start() is gated behind AGP_CODEX_LIVE", async () => {
  const proc = new LiveCodexProcess({ task: "t", repoPath: "/work", bridgeSocket: "/tmp/x.sock", env: {} });
  await expect(proc.start("s1")).rejects.toThrow(/gated/);
});

test("a bridge request surfaces as a Codex tool event and respond(allow) returns an allow verdict", async () => {
  const socketPath = freshSocket();
  const proc = new LiveCodexProcess({ task: "t", repoPath: "/work", bridgeSocket: socketPath, env: LIVE });
  const events: CodexToolEvent[] = [];
  proc.onToolCall((ev) => {
    events.push(ev);
    proc.respond(ev.id, { allow: true });
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

  // The bridge's ToolCallRequest is surfaced in Codex's native event shape.
  expect(events).toEqual([{ id: "call-1", name: "Read", arguments: { path: "/x" } }]);
  expect(res.kind === "policy_verdict" && res.verdict.decision).toBe("allow");
  await client.close();
  await proc.stop();
});

test("respond(deny) returns a deny verdict carrying the reason", async () => {
  const socketPath = freshSocket();
  const proc = new LiveCodexProcess({ task: "t", repoPath: "/work", bridgeSocket: socketPath, env: LIVE });
  proc.onToolCall((ev) => proc.respond(ev.id, { allow: false, reason: "no shell" }));
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
  expect(res.kind === "policy_verdict" && res.verdict.reason).toBe("no shell");
  await client.close();
  await proc.stop();
});

test("with no handler registered, the bridge request fails closed (error)", async () => {
  const socketPath = freshSocket();
  const proc = new LiveCodexProcess({ task: "t", repoPath: "/work", bridgeSocket: socketPath, env: LIVE });
  await proc.start("s1"); // no onToolCall
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

test("run() launches the built codex argv in the repo (injected launch, no real spawn)", async () => {
  const socketPath = freshSocket();
  let launched: { argv: string[]; cwd: string } | null = null;
  const proc = new LiveCodexProcess({
    task: "do the thing",
    repoPath: "/tmp/repo",
    bridgeSocket: socketPath,
    env: LIVE,
    launch: (argv, cwd) => {
      launched = { argv, cwd };
      return { exited: Promise.resolve(0), kill: () => {} };
    },
  });
  proc.onToolCall(() => {});
  await proc.start("s1");
  await proc.run();
  const got = launched as unknown as { argv: string[]; cwd: string };
  expect(got.cwd).toBe("/tmp/repo");
  expect(got.argv).toEqual(["codex", "exec", "do the thing"]);
  await proc.stop();
});
