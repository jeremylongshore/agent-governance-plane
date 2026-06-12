import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bridgeHookEvent, type HookEvent, parseHookEvent, runBridge } from "./hook-bridge.ts";
import { GatewayServer, type MediationHandler } from "../../gateway/server.ts";
import type { GatewayMessage } from "../../contracts/gateway-message.ts";

// A real PreToolUse event captured from claude 2.1.172 (see 037-AT-ADR D4).
const REAL_EVENT = JSON.stringify({
  session_id: "192e6168-796d-4adf-9929-853735aad72d",
  transcript_path: "/home/x/.claude/projects/p/s.jsonl",
  cwd: "/work",
  permission_mode: "default",
  hook_event_name: "PreToolUse",
  tool_name: "Read",
  tool_input: { file_path: "/work/hook.sh" },
  tool_use_id: "toolu_01LSDhwi9MFk39CAFCpHMDei",
});

// --- parseHookEvent (pure, against the measured contract) ---------------------

test("parseHookEvent maps the real PreToolUse stdin to AGP fields", () => {
  expect(parseHookEvent(REAL_EVENT)).toEqual({
    sessionId: "192e6168-796d-4adf-9929-853735aad72d",
    toolName: "Read",
    toolInput: { file_path: "/work/hook.sh" },
    toolUseId: "toolu_01LSDhwi9MFk39CAFCpHMDei",
  });
});

test("parseHookEvent rejects non-PreToolUse, malformed, or incomplete events", () => {
  expect(parseHookEvent('{"hook_event_name":"PostToolUse","tool_name":"Read"}')).toBeNull();
  expect(parseHookEvent("{not json")).toBeNull();
  expect(parseHookEvent("null")).toBeNull();
  expect(parseHookEvent('"a string"')).toBeNull();
  // missing tool_use_id
  expect(
    parseHookEvent('{"hook_event_name":"PreToolUse","session_id":"s","tool_name":"Read"}'),
  ).toBeNull();
  // missing session_id
  expect(
    parseHookEvent('{"hook_event_name":"PreToolUse","tool_name":"Read","tool_use_id":"t"}'),
  ).toBeNull();
});

test("parseHookEvent defaults a missing tool_input to {}", () => {
  const ev = parseHookEvent(
    '{"hook_event_name":"PreToolUse","session_id":"s","tool_name":"Bash","tool_use_id":"t"}',
  );
  expect(ev?.toolInput).toEqual({});
});

// --- bridgeHookEvent (against a real GatewayServer) ---------------------------

function startServer(handler: MediationHandler): Promise<{ server: GatewayServer; socketPath: string }> {
  const dir = mkdtempSync(join(tmpdir(), "agp-bridge-"));
  const socketPath = join(dir, "gate.sock");
  const server = new GatewayServer({ socketPath, handler });
  return server.listen().then(() => ({ server, socketPath }));
}

const EVENT: HookEvent = { sessionId: "s1", toolName: "Read", toolInput: { p: "/x" }, toolUseId: "call-1" };

const allowVerdict = (id: string): GatewayMessage => ({
  kind: "policy_verdict",
  id,
  sessionId: "s1",
  verdict: { decision: "allow", reason: "allowed by test", ruleId: "r1", tier: "default" },
});

const denyVerdict = (id: string): GatewayMessage => ({
  kind: "policy_verdict",
  id,
  sessionId: "s1",
  verdict: { decision: "deny", reason: "blocked by test", ruleId: null, tier: null },
});

test("an allow verdict yields exit 0", async () => {
  const { server, socketPath } = await startServer((req) => Promise.resolve(allowVerdict(req.id)));
  const res = await bridgeHookEvent(EVENT, socketPath);
  expect(res.exitCode).toBe(0);
  await server.close();
});

test("a deny verdict yields exit 2 with the reason on stderr", async () => {
  const { server, socketPath } = await startServer((req) => Promise.resolve(denyVerdict(req.id)));
  const res = await bridgeHookEvent(EVENT, socketPath);
  expect(res.exitCode).toBe(2);
  expect(res.stderr).toContain("blocked by test");
  await server.close();
});

test("a mediation error fails closed (exit 2)", async () => {
  const { server, socketPath } = await startServer(() => Promise.reject(new Error("gate exploded")));
  const res = await bridgeHookEvent(EVENT, socketPath);
  expect(res.exitCode).toBe(2);
  await server.close();
});

test("an unreachable gate fails closed (exit 2)", async () => {
  const res = await bridgeHookEvent(EVENT, join(tmpdir(), "agp-nonexistent.sock"), 500);
  expect(res.exitCode).toBe(2);
  expect(res.stderr).toContain("unreachable");
});

test("runBridge denies an unparseable hook event without touching the socket", async () => {
  const res = await runBridge("{garbage", join(tmpdir(), "agp-unused.sock"));
  expect(res.exitCode).toBe(2);
  expect(res.stderr).toContain("unparseable");
});

test("runBridge end-to-end: real stdin + allow verdict → exit 0", async () => {
  const { server, socketPath } = await startServer((req) => Promise.resolve(allowVerdict(req.id)));
  const res = await runBridge(REAL_EVENT, socketPath);
  expect(res.exitCode).toBe(0);
  await server.close();
});
