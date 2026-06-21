// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See
// 000-docs/042-AT-ADR-transactional-outbox-channel-delivery.md.
//
// OutboxDelivery — a durable, retryable channel-PROJECTION obligation (agp-4na.3).
// When a best-effort projection (ChannelAdapter.projectEvent) fails, the obligation
// is recorded here instead of being silently lost, and a poller redelivers it —
// including after a daemon restart. At-least-once: a crash between a successful
// post and the delivered-mark redelivers (a duplicate), so consumers dedup on `id`.
//
// SCOPE INVARIANT (002 §2.4 / 018 / 022): projection is best-effort, one-way, and
// NEVER authoritative. The signed journal remains the sole source of truth; an
// undelivered obligation never blocks governance and never makes a Slack message
// part of the audit record. This contract makes delivery durable, NOT authoritative.

import { z } from "zod";

export const OutboxStatus = z.enum(["pending", "delivered"]);
export type OutboxStatus = z.infer<typeof OutboxStatus>;

export const OutboxDelivery = z.object({
  /** Idempotency key — stable across redeliveries; consumers dedup on this. */
  id: z.string().min(1),
  /** The projected event kind (mirrors a journal event kind, e.g. session.ended). */
  eventKind: z.string().min(1),
  /** Human-readable summary posted to the channel. */
  summary: z.string().min(1),
  status: OutboxStatus.default("pending"),
  /** Delivery attempts made so far (>=1 once attempted). */
  attempts: z.number().int().nonnegative().default(0),
  enqueuedAt: z.string().min(1),
  /** ISO timestamp of successful delivery; null while pending. */
  deliveredAt: z.string().nullable().default(null),
});

export type OutboxDelivery = z.infer<typeof OutboxDelivery>;
