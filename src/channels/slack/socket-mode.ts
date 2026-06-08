// SocketModeInteractionSource — the production InteractionSource. It receives a
// human's Approve/Deny click over Slack Socket Mode (an outbound WebSocket from
// the control plane to Slack — no public ingress, honouring the "no public
// surface until defensible" P0 decision) and resolves the matching awaiting
// gate() call.
//
// Two cleanly separable concerns so the parser is CI-testable without a socket:
//   - parseBlockAction(payload): PURE. block_actions payload -> SlackInteraction.
//   - SocketModeInteractionSource: holds the pending-by-nonce promise map, acks
//     every frame, resolves on a matching click, fails closed on timeout/close.
// The live WebSocket dial is injected via SocketDialer so CI feeds canned frames
// (see slack-dialer.ts for the real, AGP_SLACK_LIVE-gated implementation).

import { ACTION_APPROVE, ACTION_DENY } from "./blocks.ts";
import type { InteractionSource, SlackInteraction } from "./interactions.ts";

/** A decoded Socket Mode envelope. Slack frames carry an `envelope_id` that must
 *  be acked, a `type` ("hello" | "disconnect" | "interactive" | ...), and a
 *  `payload` (the interaction payload when `type === "interactive"`). */
export interface SocketFrame {
  type?: string;
  envelope_id?: string;
  payload?: unknown;
}

/** A live Socket Mode connection. The real impl wraps a WebSocket; tests use a
 *  fake whose `send` is inspectable and which delivers canned frames. */
export interface SocketConnection {
  onMessage(handler: (frame: SocketFrame) => void): void;
  onClose(handler: () => void): void;
  /** Send a raw text frame (used to ack envelopes). */
  send(text: string): void;
  close(): void;
}

/** Opens a Socket Mode connection for an app-level token. Injected so the live
 *  WebSocket can be gated behind AGP_SLACK_LIVE and faked in CI. */
export interface SocketDialer {
  open(appToken: string): Promise<SocketConnection>;
}

/** Reason a received click could not be matched to an awaiting approval. */
export interface RejectedInteraction {
  reason: "unknown nonce" | "nonce already used (replay)";
  nonce: string;
  userId?: string;
}

export interface SocketModeOptions {
  appToken: string;
  dialer: SocketDialer;
  /** How long to wait for a human before failing closed. Defaults to the nonce
   *  TTL (5 min) so the receiver never out-waits the nonce. */
  awaitTimeoutMs?: number;
  /** Fired for a click that reaches the receiver but matches no awaiting
   *  approval (a stray, late, or replayed click) — wired to the journal so a
   *  forged/replayed click is auditable rather than silently dropped. */
  onRejected?: (rejected: RejectedInteraction) => void;
}

/**
 * Parse a Socket Mode interactive payload into a SlackInteraction. PURE — no
 * I/O, no socket. Returns null for any non-AGP, malformed, or non-block_actions
 * payload so the receiver can ack-and-ignore noise.
 */
export function parseBlockAction(payload: unknown): SlackInteraction | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p.type !== "block_actions") return null;

  const actions = p.actions;
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const action = actions[0];
  if (typeof action !== "object" || action === null) return null;
  const a = action as Record<string, unknown>;

  const actionId = a.action_id;
  let approved: boolean;
  if (actionId === ACTION_APPROVE) approved = true;
  else if (actionId === ACTION_DENY) approved = false;
  else return null;

  const nonce = a.value;
  if (typeof nonce !== "string" || nonce.length === 0) return null;

  const user = p.user;
  if (typeof user !== "object" || user === null) return null;
  const u = user as Record<string, unknown>;
  const userId = u.id;
  if (typeof userId !== "string" || userId.length === 0) return null;
  const isBot = u.is_bot === true;

  return { nonce, approved, userId, isBot };
}

interface PendingApproval {
  resolve: (interaction: SlackInteraction) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SocketModeInteractionSource implements InteractionSource {
  private readonly appToken: string;
  private readonly dialer: SocketDialer;
  private readonly awaitTimeoutMs: number;
  private readonly onRejected?: (rejected: RejectedInteraction) => void;
  private readonly pending = new Map<string, PendingApproval>();
  /** Nonces already resolved — lets a replayed click be reported as a replay
   *  rather than a generic unknown nonce. */
  private readonly resolved = new Set<string>();
  private connection?: SocketConnection;
  private stopped = false;

  constructor(opts: SocketModeOptions) {
    this.appToken = opts.appToken;
    this.dialer = opts.dialer;
    this.awaitTimeoutMs = opts.awaitTimeoutMs ?? 300_000;
    this.onRejected = opts.onRejected;
  }

  /** Open the socket and register handlers. */
  async start(): Promise<void> {
    const conn = await this.dialer.open(this.appToken);
    this.connection = conn;
    conn.onMessage((frame) => this.handleFrame(frame));
    conn.onClose(() => this.handleClose());
  }

  /** Close the socket and fail closed on every still-pending approval. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.rejectAllPending(new Error("receiver stopped"));
    this.connection?.close();
    this.connection = undefined;
  }

  awaitInteraction(nonce: string): Promise<SlackInteraction> {
    return new Promise<SlackInteraction>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(nonce);
        reject(new Error(`approval timed out for nonce ${nonce}`));
      }, this.awaitTimeoutMs);
      this.pending.set(nonce, { resolve, reject, timer });
    });
  }

  private handleFrame(frame: SocketFrame): void {
    // Ack first — Slack redelivers unacked envelopes.
    if (frame.envelope_id !== undefined) {
      this.connection?.send(JSON.stringify({ envelope_id: frame.envelope_id }));
    }
    const interaction = parseBlockAction(frame.payload);
    if (interaction === null) return; // hello/disconnect/non-AGP/malformed — noise

    const pending = this.pending.get(interaction.nonce);
    if (pending === undefined) {
      // No awaiting approval: a stray, late, or replayed click. Report it so the
      // journal can record a forged/replayed click; authorization is still
      // enforced by NonceStore.consume on the resolved path.
      this.onRejected?.({
        reason: this.resolved.has(interaction.nonce) ? "nonce already used (replay)" : "unknown nonce",
        nonce: interaction.nonce,
        userId: interaction.userId,
      });
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(interaction.nonce);
    this.resolved.add(interaction.nonce);
    pending.resolve(interaction);
  }

  private handleClose(): void {
    if (this.stopped) return;
    // A transient close mid-await must not hang the gate. Fail closed: reject
    // every pending approval so the daemon denies. (Reconnect is a follow-on.)
    this.rejectAllPending(new Error("socket closed"));
  }

  private rejectAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}
