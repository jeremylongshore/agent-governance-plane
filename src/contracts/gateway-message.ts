// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See 000-docs/015-AT-CONT-gateway-message.md.
//
// GatewayMessage — the internal protocol between a sandboxed sprite and the
// control plane. Every tool call the agent attempts becomes a request the
// gateway mediates (policy gate → optional HITL → journal) before a result
// flows back. Discriminated on `kind`.

import { z } from "zod";
import { Actor } from "./_common.ts";
import { PolicyVerdict } from "./policy-verdict.ts";

const Base = {
  /** Unique message id (correlates request ↔ verdict ↔ result). */
  id: z.string().min(1),
  /** Session this message belongs to. */
  sessionId: z.string().min(1),
};

/** Sprite → gateway: "the agent wants to make this tool call". */
export const ToolCallRequest = z.object({
  ...Base,
  kind: z.literal("tool_call_request"),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  actor: Actor,
});

/** Gateway → sprite: the policy verdict for a pending request. */
export const VerdictMessage = z.object({
  ...Base,
  kind: z.literal("policy_verdict"),
  verdict: PolicyVerdict,
});

/** Gateway → sprite: the result of an allowed tool call. */
export const ToolCallResult = z.object({
  ...Base,
  kind: z.literal("tool_call_result"),
  ok: z.boolean(),
  output: z.unknown(),
});

/** Either direction: a protocol-level error (never a tool's own failure). */
export const GatewayError = z.object({
  ...Base,
  kind: z.literal("error"),
  message: z.string().min(1),
});

export const GatewayMessage = z.discriminatedUnion("kind", [
  ToolCallRequest,
  VerdictMessage,
  ToolCallResult,
  GatewayError,
]);

export type ToolCallRequest = z.infer<typeof ToolCallRequest>;
export type VerdictMessage = z.infer<typeof VerdictMessage>;
export type ToolCallResult = z.infer<typeof ToolCallResult>;
export type GatewayError = z.infer<typeof GatewayError>;
export type GatewayMessage = z.infer<typeof GatewayMessage>;
