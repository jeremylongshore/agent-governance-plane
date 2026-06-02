// NonceStore — one-time approval nonces, aligned with CCSC's nonce-HITL pattern.
// Each approval request mints a random nonce bound to (messageId, sessionId,
// expiry). A decision is honoured only if its nonce exists, has not expired, has
// not already been consumed, and is bound to the same request. Consuming is
// one-shot, so a replayed nonce is rejected.

import { randomUUID } from "node:crypto";

export interface NonceBinding {
  messageId: string;
  sessionId: string;
  expiresAt: number;
}

export interface ConsumeResult {
  ok: boolean;
  reason?: string;
}

export class NonceStore {
  private readonly entries = new Map<string, { binding: NonceBinding; consumed: boolean }>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly gen: () => string;

  constructor(opts: { ttlMs?: number; now?: () => number; gen?: () => string } = {}) {
    this.ttlMs = opts.ttlMs ?? 300_000; // 5 min
    this.now = opts.now ?? (() => Date.now());
    this.gen = opts.gen ?? (() => randomUUID());
  }

  /** Mint a nonce bound to a request. */
  mint(binding: Pick<NonceBinding, "messageId" | "sessionId">): string {
    const nonce = this.gen();
    this.entries.set(nonce, {
      binding: { ...binding, expiresAt: this.now() + this.ttlMs },
      consumed: false,
    });
    return nonce;
  }

  /**
   * Consume a nonce for a specific request. One-time: a second consume of the
   * same nonce is rejected (replay). Does NOT consume on a binding/expiry
   * failure, so a forged attempt can't burn a still-valid nonce.
   */
  consume(nonce: string, messageId: string): ConsumeResult {
    const entry = this.entries.get(nonce);
    if (!entry) return { ok: false, reason: "unknown nonce" };
    if (entry.consumed) return { ok: false, reason: "nonce already used (replay)" };
    if (this.now() > entry.binding.expiresAt) return { ok: false, reason: "nonce expired" };
    if (entry.binding.messageId !== messageId) {
      return { ok: false, reason: "nonce not bound to this request" };
    }
    entry.consumed = true;
    return { ok: true };
  }
}
