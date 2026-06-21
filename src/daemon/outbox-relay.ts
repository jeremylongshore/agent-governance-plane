// OutboxRelay — the transactional-outbox delivery path for channel projections
// (agp-4na.3). Design: 000-docs/042-AT-ADR-transactional-outbox-channel-delivery.md.
//
// project(): enqueue a DURABLE obligation first, then attempt delivery; on failure
// the obligation stays pending (it is NOT silently dropped, unlike a raw
// best-effort projectEvent). drain(): a poller that redelivers every pending
// obligation — called on daemon startup so deliveries survive a restart.
//
// Invariant preserved: this NEVER throws and never makes projection authoritative.
// The signed journal remains the sole source of truth; an undelivered obligation
// never blocks governance. At-least-once (consumers dedup on OutboxDelivery.id).

import { randomUUID } from "node:crypto";
import { OutboxDelivery } from "../contracts/outbox-delivery.ts";
import type { OutboxStore } from "./outbox-store.ts";

/** The projection surface the relay drives — the best-effort half of a channel. */
export interface ProjectionChannel {
  projectEvent(eventKind: string, summary: string): Promise<boolean>;
}

export interface OutboxRelayOptions {
  /** ISO clock, injectable for deterministic tests. Default: Date. */
  now?: () => string;
  /** Idempotency-key generator, injectable for tests. Default: uuid. */
  genId?: () => string;
}

export interface DrainResult {
  delivered: number;
  stillPending: number;
}

export class OutboxRelay {
  private readonly now: () => string;
  private readonly genId: () => string;

  constructor(
    private readonly channel: ProjectionChannel,
    private readonly store: OutboxStore,
    opts: OutboxRelayOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date().toISOString());
    this.genId = opts.genId ?? (() => randomUUID());
  }

  /**
   * Durably project an event: record the obligation, then attempt delivery. A
   * failed/declined attempt leaves the obligation pending for a later drain() —
   * the delivery is never silently lost. Returns the resulting record. Never throws.
   */
  async project(eventKind: string, summary: string): Promise<OutboxDelivery> {
    const entry = OutboxDelivery.parse({
      id: this.genId(),
      eventKind,
      summary,
      status: "pending",
      attempts: 0,
      enqueuedAt: this.now(),
      deliveredAt: null,
    });
    this.store.enqueue(entry);
    await this.attempt(entry);
    return this.store.get(entry.id) ?? entry;
  }

  /**
   * Poller: redeliver every pending obligation. Call on startup so deliveries
   * enqueued before a crash are sent once the channel is reachable again.
   * Never throws — a still-unreachable channel just leaves obligations pending.
   */
  async drain(): Promise<DrainResult> {
    const pending = this.store.pending();
    for (const entry of pending) await this.attempt(entry);
    const stillPending = this.store.pending().length;
    return { delivered: pending.length - stillPending, stillPending };
  }

  /** One delivery attempt. Records the attempt, posts, marks delivered on success.
   *  Swallows channel errors (best-effort invariant) — the obligation persists. */
  private async attempt(entry: OutboxDelivery): Promise<void> {
    this.store.recordAttempt(entry.id);
    try {
      const ok = await this.channel.projectEvent(entry.eventKind, entry.summary);
      if (ok) this.store.markDelivered(entry.id, this.now());
    } catch {
      // Channel threw — leave the obligation pending for the next drain().
    }
  }
}
