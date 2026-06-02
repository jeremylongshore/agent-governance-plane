// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See 000-docs/016-AT-CONT-sprite-adapter.md.
//
// SpriteAdapter — the contract a harness adapter implements so AGP can drive any
// agent harness (Claude Code first; Codex next) through one interface. The
// adapter surfaces the harness's tool calls to the gateway and delivers results
// back. Identity is a data schema; the driving surface is a TS interface.

import { z } from "zod";
import type { GatewayMessage, ToolCallRequest, ToolCallResult } from "./gateway-message.ts";

/** Identifies a sprite implementation. `uri` is reserved (Sigstore, v0.6) — null at v0. */
export const SpriteIdentity = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  /** Sprite identity URI for supply-chain verification — null until v0.6. */
  uri: z.string().nullable().default(null),
});
export type SpriteIdentity = z.infer<typeof SpriteIdentity>;

/** Handler the gateway registers to receive tool-call requests from the sprite. */
export type ToolCallHandler = (req: ToolCallRequest) => void;

export interface SpriteAdapter {
  readonly identity: SpriteIdentity;
  /** Begin a session for the given session id. */
  start(sessionId: string): Promise<void>;
  /** Register the gateway's handler for tool-call requests this sprite emits. */
  onToolCall(handler: ToolCallHandler): void;
  /** Deliver a gateway message (verdict or result) back to the sprite. */
  deliver(message: GatewayMessage): Promise<void>;
  /** Tear the session down; idempotent. */
  stop(): Promise<void>;
}

/** Convenience alias used by adapters that only ever deliver results. */
export type { ToolCallResult };
