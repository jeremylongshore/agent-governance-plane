// INTERNAL — unstable — no public RFC.
// Breaking changes require a Bead + an ADR. See
// 000-docs/041-AT-ADR-durable-session-lease-and-recovery.md.
//
// SessionLease — fenced ownership of an in-flight agent session so a daemon
// crash does not orphan it. A lease binds (sessionId, ownerInstanceId) with a
// monotonic fencing token + a heartbeat/expiry; a restarted daemon sweeps the
// store and REAPS expired leases instead of losing the session. The fencing
// token lets a new owner supersede a stale/zombie owner (a higher token wins),
// so an old process that wakes up cannot keep acting under a session a new
// daemon has taken over.
//
// Scope (per 041-AT-ADR): this adds session resumption/reap — operational
// reliability — NOT the audit guarantee. The signed journal is already
// crash-durable on its own; the lease governs WHO may act for a session.

import { z } from "zod";

export const SessionLeaseStatus = z.enum(["active", "released", "reaped"]);
export type SessionLeaseStatus = z.infer<typeof SessionLeaseStatus>;

export const SessionLease = z.object({
  sessionId: z.string().min(1),
  /** The daemon instance that owns the session (a per-process id). */
  ownerInstanceId: z.string().min(1),
  /** Monotonic fence: a strictly higher token supersedes a lower one. */
  fencingToken: z.number().int().positive(),
  /** ISO timestamp of the owner's last heartbeat. */
  heartbeatAt: z.string().min(1),
  /** ISO timestamp after which the lease is expired (reapable on recovery). */
  expiresAt: z.string().min(1),
  status: SessionLeaseStatus.default("active"),
});

export type SessionLease = z.infer<typeof SessionLease>;
