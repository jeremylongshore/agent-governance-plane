// Gateway wire protocol — the framing for GatewayMessages carried between a
// sandboxed intendant and the control plane. v0 transport is a Unix domain socket
// ONLY; network transport is forbidden until sender-constrained auth lands
// (see 000-docs/029-AT-ADR-gateway-unix-socket-only.md for the confused-deputy
// rationale). This module is transport-agnostic framing: newline-delimited
// JSON, one GatewayMessage per line.
//
// Decoding is STRICT and fail-closed: malformed JSON, an oversize frame, or a
// schema-invalid message is rejected, never partially processed.

import { GatewayMessage } from "../contracts/gateway-message.ts";

/** Max bytes a single frame (one line) may occupy before it is rejected. */
export const MAX_FRAME_BYTES = 1_048_576; // 1 MiB

/** A protocol-level failure (malformed/oversize/invalid). Always fail-closed. */
export class GatewayProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayProtocolError";
  }
}

/** Serialize a validated GatewayMessage to a single newline-terminated frame. */
export function encodeMessage(message: GatewayMessage): string {
  // Validate on the way out too — a bug that emits a malformed message should
  // surface here, not at the peer.
  const parsed = GatewayMessage.parse(message);
  return `${JSON.stringify(parsed)}\n`;
}

/** Decode one frame (a single line, no trailing newline). Throws on malformed. */
export function decodeMessage(line: string): GatewayMessage {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (err) {
    throw new GatewayProtocolError(`invalid JSON frame: ${(err as Error).message}`);
  }
  const result = GatewayMessage.safeParse(raw);
  if (!result.success) {
    throw new GatewayProtocolError(`schema-invalid GatewayMessage: ${result.error.issues[0]?.message ?? "unknown"}`);
  }
  return result.data;
}

/**
 * Streaming frame decoder. Accumulates chunks and yields complete messages as
 * newlines arrive. Throws GatewayProtocolError (fail-closed) if the buffer for a
 * single unterminated frame exceeds MAX_FRAME_BYTES, or if any frame is
 * malformed — the caller must treat a throw as "reject and close".
 */
export class FrameDecoder {
  private buffer = "";

  push(chunk: string): GatewayMessage[] {
    this.buffer += chunk;
    const out: GatewayMessage[] = [];
    let newlineIdx = this.buffer.indexOf("\n");
    while (newlineIdx >= 0) {
      const line = this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (line.trim() !== "") out.push(decodeMessage(line));
      newlineIdx = this.buffer.indexOf("\n");
    }
    // A partial frame is allowed to accumulate, but not unboundedly.
    if (this.buffer.length > MAX_FRAME_BYTES) {
      throw new GatewayProtocolError(`frame exceeds MAX_FRAME_BYTES (${MAX_FRAME_BYTES})`);
    }
    return out;
  }
}
