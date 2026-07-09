// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See
// 000-docs/056-AT-CONT-trigger-source.md (stability) and
// 000-docs/055-AT-ADR-build-vs-compose-and-trigger-source-contract.md (why it exists).
//
// TriggerSource — the contract for a source that WAKES a governed agent. Every
// existing agent in the estate (intentvision, perception, intent-mail's watch
// daemon) already lacks a common trigger; this is the one genuinely net-new AGP
// primitive for Slice 0 of the Governed Agent OS (000-docs/054-PP-ROAD).
//
// A TriggerSource emits `TriggerEvent`s. Each event is handed to the daemon,
// which threads it through `mediate()` (policy gate → HITL → signed journal →
// sandbox exec) exactly like an intendant tool call. This file is a LEAF: it
// defines the port and its data shapes only and MUST NOT import the daemon
// (leaf-layer invariant enforced by Greptile). mediate() wiring and the concrete
// cron/webhook/channel sources are follow-up beads under agp-eva.1.
//
// The three Slice-0 invariants (000-docs/054-PP-ROAD §Invariants) are load-bearing
// fields here, reserved from the first commit so populating them later is not a
// breaking change:
//   1. Cross-chain causal pointer — `TriggerEvent.correlationId` is the shared id
//      that the AGP journal ("what it did") and the GSB receipt ("what it knew")
//      both carry, so "what did the agent know when it acted X?" stays answerable.
//   2. Liveness dead-man's-switch — `TriggerSourceSpec.livenessTimeoutMs` +
//      `heartbeat()` let a supervisor escalate a cadence-bearing source that goes
//      silent (the failure class with no recovery path).
//   3. Fail-closed — `TriggerSourceSpec.enabled` defaults to `false` (the trigger
//      is a flag-gated spike), and the schemas are `.strict()` so a malformed
//      event is rejected, never partially processed.

import { z } from "zod";
import { IsoTimestamp } from "./_common.ts";

/**
 * How a source decides to fire.
 * - `cron`          — a schedule (notify-lib / unified scheduler).
 * - `webhook`       — an inbound HMAC-verified request (@gwi/github-webhook).
 * - `channel_event` — a Slack/Discord message (CCSC Socket Mode ingestion).
 * - `poll`          — a watch-and-diff loop (intent-mail watch daemon).
 * - `manual`        — an operator-invoked one-shot (`agp run` / run-now).
 */
export const TriggerKind = z.enum(["cron", "webhook", "channel_event", "poll", "manual"]);
export type TriggerKind = z.infer<typeof TriggerKind>;

/**
 * One firing of a source: the unit that wakes a governed agent session.
 * `.strict()` — an unknown key is a malformed trigger and is rejected
 * (fail-closed); a bad frame never reaches `mediate()`.
 */
export const TriggerEvent = z
  .object({
    /** Unique id for this single firing (idempotency handle for the daemon). */
    triggerId: z.string().min(1),
    /** The `TriggerSourceSpec.id` that emitted this event. */
    source: z.string().min(1),
    kind: TriggerKind,
    /** When the source fired. */
    firedAt: IsoTimestamp,
    /**
     * Cross-chain causal pointer (invariant 1). The shared id stamped into both
     * the AGP journal entry and the GSB receipt for the run this event wakes,
     * so the two hash chains can be joined after the fact. REQUIRED — a trigger
     * with no correlation id cannot be causally reconstructed, so it is refused.
     */
    correlationId: z.string().min(1),
    /**
     * Dedup / suppression key (invariant 3 support). Two firings that carry the
     * same `dedupeKey` describe the same underlying fact; the state layer (GSB /
     * intentvision suppression windows) uses it to deliver "only NEW meaningful
     * events" and to satisfy the Slice-0 "same SHA twice → no re-alert" test.
     * Null when a source has no natural dedup key (e.g. a bare cron tick).
     */
    dedupeKey: z.string().min(1).nullable().default(null),
    /**
     * The intendant session this event should wake. Null when the daemon assigns
     * the session at admission time rather than the source pinning it.
     */
    sessionId: z.string().min(1).nullable().default(null),
    /**
     * Redacted, structured payload — the source-specific facts (the webhook body
     * digest, the anomaly record, the changed-file list). Same shape discipline
     * as JournalEvent.payload: no secrets, structured, redacted.
     */
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type TriggerEvent = z.infer<typeof TriggerEvent>;

/**
 * The declaration of a source, as read by the daemon and the liveness supervisor.
 * `.strict()` and fail-closed: `enabled` defaults to `false` so a newly declared
 * source is inert until an operator turns it on (the flag-gated spike posture).
 */
export const TriggerSourceSpec = z
  .object({
    /** Stable source id; referenced by `TriggerEvent.source`. */
    id: z.string().min(1),
    kind: TriggerKind,
    /**
     * Fail-closed: a source does not fire until explicitly enabled. Slice 0
     * spikes the trigger inside AGP behind this flag to keep the kernel clean.
     */
    enabled: z.boolean().default(false),
    /**
     * Liveness dead-man's-switch (invariant 2). For a cadence-bearing source
     * (cron/poll), the max ms of silence tolerated before the supervisor
     * escalates. Null for a source with no cadence expectation (a pure webhook
     * that may legitimately never fire), which the supervisor does not watch.
     */
    livenessTimeoutMs: z.number().int().positive().nullable().default(null),
    /**
     * Opaque, source-specific config (a cron expression, a webhook path, a Slack
     * channel id). Interpreted by the concrete source, opaque to the daemon.
     */
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type TriggerSourceSpec = z.infer<typeof TriggerSourceSpec>;

/**
 * A liveness sample the supervisor reads to run the dead-man's-switch. A source
 * whose `lastEventAt` is older than its `TriggerSourceSpec.livenessTimeoutMs`
 * (relative to the supervisor's clock) is silent-and-escalatable.
 */
export const TriggerHeartbeat = z
  .object({
    sourceId: z.string().min(1),
    /** True while the source is started and expected to be emitting. */
    running: z.boolean(),
    /** ISO time of the source's most recent emitted event; null if none yet. */
    lastEventAt: IsoTimestamp.nullable(),
    /** Count of consecutive restarts, for restart-intensity bounding. */
    restartCount: z.number().int().nonnegative().default(0),
  })
  .strict();
export type TriggerHeartbeat = z.infer<typeof TriggerHeartbeat>;

/**
 * The runtime port. A concrete source (cron, webhook receiver, channel listener,
 * poll loop) implements this; the daemon depends only on this interface, so a
 * new source type is added without touching the `mediate()` loop.
 */
export interface TriggerSource {
  /** The source's declaration (id, kind, enabled, liveness expectation). */
  spec(): TriggerSourceSpec;
  /**
   * Begin emitting. `emit` is the daemon's admission callback; a source calls it
   * once per firing. A source MUST NOT emit before `start` or after `stop`.
   * Calling `start` on an `enabled: false` spec is a no-op (fail-closed).
   */
  start(emit: (event: TriggerEvent) => Promise<void>): Promise<void>;
  /** Stop emitting; idempotent. */
  stop(): Promise<void>;
  /** Current liveness sample for the supervisor. */
  heartbeat(): TriggerHeartbeat;
}
