import { test, expect } from "bun:test";
import { GatewayMessage } from "./gateway-message.ts";
import { validToolCallRequest, validRequireVerdict } from "./fixtures.ts";

test("a tool_call_request parses and keeps its discriminator", () => {
  const parsed = GatewayMessage.parse(validToolCallRequest);
  expect(parsed.kind).toBe("tool_call_request");
});

test("each message kind round-trips through the union", () => {
  const verdict = {
    kind: "policy_verdict" as const,
    id: "m2",
    sessionId: "s1",
    verdict: validRequireVerdict,
  };
  const result = { kind: "tool_call_result" as const, id: "m3", sessionId: "s1", ok: true, output: 42 };
  const err = { kind: "error" as const, id: "m4", sessionId: "s1", message: "boom" };
  expect(GatewayMessage.safeParse(verdict).success).toBe(true);
  expect(GatewayMessage.safeParse(result).success).toBe(true);
  expect(GatewayMessage.safeParse(err).success).toBe(true);
});

test("an unknown kind is rejected", () => {
  expect(
    GatewayMessage.safeParse({ kind: "smuggle", id: "x", sessionId: "s1" }).success,
  ).toBe(false);
});

test("a tool_call_request missing its tool is rejected", () => {
  const { tool, ...noTool } = validToolCallRequest as Record<string, unknown> & { tool: string };
  void tool;
  expect(GatewayMessage.safeParse(noTool).success).toBe(false);
});
