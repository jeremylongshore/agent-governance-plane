// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See 000-docs/016-AT-CONT-intendant-adapter.md.
//
// IntendantAdapter — the contract a harness adapter implements so AGP can drive any
// agent harness (Claude Code first; Codex next) through one interface. The
// adapter surfaces the harness's tool calls to the gateway and delivers results
// back. Identity is a data schema; the driving surface is a TS interface.

import { z } from "zod";
import type { GatewayMessage, ToolCallRequest, ToolCallResult } from "./gateway-message.ts";

/** Identifies a intendant implementation. `uri` is reserved (Sigstore, v0.6) — null at v0. */
export const IntendantIdentity = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  /** Intendant identity URI for supply-chain verification — null until v0.6. */
  uri: z.string().nullable().default(null),
});
export type IntendantIdentity = z.infer<typeof IntendantIdentity>;

/** Handler the gateway registers to receive tool-call requests from the intendant. */
export type ToolCallHandler = (req: ToolCallRequest) => void;

export interface IntendantAdapter {
  readonly identity: IntendantIdentity;
  /** Begin a session for the given session id. */
  start(sessionId: string): Promise<void>;
  /** Register the gateway's handler for tool-call requests this intendant emits. */
  onToolCall(handler: ToolCallHandler): void;
  /** Deliver a gateway message (verdict or result) back to the intendant. */
  deliver(message: GatewayMessage): Promise<void>;
  /** Tear the session down; idempotent. */
  stop(): Promise<void>;
}

/** Convenience alias used by adapters that only ever deliver results. */
export type { ToolCallResult };
