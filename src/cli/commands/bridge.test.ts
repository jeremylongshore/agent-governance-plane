import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bridgeCommand } from "./bridge.ts";
import { GatewayServer } from "../../gateway/server.ts";
import type { GatewayMessage } from "../../contracts/gateway-message.ts";

const REAL_EVENT = JSON.stringify({
  hook_event_name: "PreToolUse",
  session_id: "s1",
  tool_name: "Read",
  tool_input: { file_path: "/x" },
  tool_use_id: "toolu_abc",
});

test("missing --socket fails closed (exit 2)", async () => {
  const errs: string[] = [];
  const code = await bridgeCommand([], REAL_EVENT, (l) => errs.push(l));
  expect(code).toBe(2);
  expect(errs.join("\n")).toContain("--socket");
});

test("allow verdict over the socket → exit 0", async () => {
  const socketPath = join(mkdtempSync(join(tmpdir(), "agp-brg-")), "gate.sock");
  const allow = (id: string): GatewayMessage => ({
    kind: "policy_verdict",
    id,
    sessionId: "s1",
    verdict: { decision: "allow", reason: "ok", ruleId: "r1", tier: "default" },
  });
  const server = new GatewayServer({ socketPath, handler: (req) => Promise.resolve(allow(req.id)) });
  await server.listen();
  const code = await bridgeCommand(["--socket", socketPath], REAL_EVENT, () => {});
  expect(code).toBe(0);
  await server.close();
});

test("deny verdict over the socket → exit 2 with the reason", async () => {
  const socketPath = join(mkdtempSync(join(tmpdir(), "agp-brg-")), "gate.sock");
  const deny = (id: string): GatewayMessage => ({
    kind: "policy_verdict",
    id,
    sessionId: "s1",
    verdict: { decision: "deny", reason: "nope", ruleId: null, tier: null },
  });
  const errs: string[] = [];
  const server = new GatewayServer({ socketPath, handler: (req) => Promise.resolve(deny(req.id)) });
  await server.listen();
  const code = await bridgeCommand(["--socket", socketPath], REAL_EVENT, (l) => errs.push(l));
  expect(code).toBe(2);
  expect(errs.join("\n")).toContain("nope");
  await server.close();
});
