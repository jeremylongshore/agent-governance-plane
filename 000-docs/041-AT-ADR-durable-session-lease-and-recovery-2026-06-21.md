---
title: ADR — Durable Session Lease + Crash Recovery
date: 2026-06-21
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted
epic: agp-4na — Harden the governance-plane runtime with patterns from the peer-runtime audit
implements: agp-4na.2 (durable daemon execution with a session lease and crash recovery)
decision: Lease-fenced durable sessions + a startup recovery sweep; frozen SessionLease contract
---

# ADR — Durable Session Lease + Crash Recovery

> **Status: Accepted (CTO, 2026-06-21).** Implements `agp-4na.2` under epic
> `agp-4na`. Adds a fenced `SessionLease` + `SessionStore` so an in-flight agent
> session survives a daemon crash via a startup recovery sweep. Frozen-contract
> ADR per the bead (a new `src/contracts/` type needs a Bead + ADR).

## Context — and why the post-v0 hold is lifted

`agp-4na.2` was explicitly deferred **post-v0** on 2026-06-03 (engineer's call,
operator-delegated), aligned with blueprint `002-PP-PLAN` §2.3's deliberate
deferral of exactly-once / durable-session guarantees. The deferral was
**conditioned**: *"deferred until the daemon/gateway epics are ready and the hold
is lifted."*

That condition is now met:

- **v0 shipped** (v0.1.61); the daemon (`src/daemon/daemon.ts`) and gateway are
  built — the original blocker ("both depend on the still-unbuilt daemon/gateway")
  is resolved.
- We are in the **post-v0 execution phase** the roadmap (`039-PP-ROAD`) defines,
  where this is sequenced as item #2 (runtime hardening — "make the daemon
  production-real").

**The hold is therefore lifted and the work is built now.** This is a deliberate
re-resolution of the documented "KEEP POST-V0" decision, recorded here for the
audit trail.

### Honest scope (unchanged from the deferral's framing)

This adds session **resumption / reap** — operational reliability — **not** the
audit guarantee. AGP's actual product guarantee, the signed hash-chained journal
of every tool call, is **already crash-durable on its own** and is untouched here.
The lease governs *who may act for a session* and ensures a crash doesn't silently
orphan session state; it does not change what the journal proves.

## Decision

Adopt the peer-runtime audit's **lease-fenced durable execution** pattern, routed
to AGP as a governance-plane-level pattern (per `009-AT-ADR` substrate boundary):

1. **`SessionLease` contract** (`src/contracts/session-lease.ts`, frozen) — binds
   `(sessionId, ownerInstanceId)` with a **monotonic fencing token**, a heartbeat,
   and an expiry; status `active | released | reaped`.
2. **`SessionStore`** (`src/daemon/session-store.ts`) — persists leases: the
   interface, an `InMemorySessionStore` (reference/tests), and a `FileSessionStore`
   (`$AGP_HOME/sessions.json`, read-modify-write per op — right-sized for the
   single-operator, low-rate v0+ path).
3. **Recovery sweep** — `Daemon.recoverSessions()` reaps every active lease whose
   expiry has passed (an owner that crashed without releasing) and **journals each
   reap** (`session.reaped`), so the audit trail records the recovery. Called on
   daemon startup (`agp run`) before any session is driven.

### Lease algebra (the fencing semantics)

- **acquire** bumps the fencing token to one above the previous; refuses if a
  *different* owner still holds a live (unexpired, active) lease — that owner is
  protected.
  The *same* owner re-acquiring its own lease is allowed (idempotent restart).
- **heartbeat** refreshes expiry; **fails closed** (`FencedError`) if the stored
  lease has a higher token, is gone, or is no longer active — a superseded/zombie
  owner cannot keep acting.
- **release** (clean session end) marks `released`; releasing a superseded lease
  is a no-op.
- **reapExpired** marks past-expiry active leases `reaped`.

On a clean session end the lease is released. **On a throw mid-session the lease is
deliberately NOT released** — it expires and the next `recoverSessions()` reaps it.
That is the recovery behavior, not a leak.

### Right-sizing for v0+ (no over-engineering)

v0 is single-operator, so there is no multi-node contention to coordinate. The
fencing token is still justified: it prevents a stale/zombie daemon process on the
same host (e.g. a hung old invocation that wakes up) from acting under a session a
new daemon now owns. No distributed consensus, no external lock service — a small
JSON file + monotonic token + heartbeat is the correct weight. Lease TTL defaults
to 5 minutes, refreshed per gated call (calls are serialized by PreToolUse
back-pressure, so the read-modify-write does not race in practice).

## Consequences

- The `Daemon` gains optional `sessionStore` / `instanceId` / `nowMs` /
  `leaseTtlMs` deps. **Absent a store, sessions run unleased — the prior reference
  behavior** — so every existing test and the deterministic dogfood are unchanged;
  `run.ts` opts in by constructing a `FileSessionStore`.
- A new journal event kind, `session.reaped`, records each recovery.
- The frozen `SessionLease` contract joins the others — breaking changes need a
  Bead + ADR.
- `agp-4na.3` (transactional outbox — channel redelivery) builds on this and is
  next in the epic.

## References

`002-PP-PLAN` §2.3 (the deferral being lifted), `039-PP-ROAD` (item #2),
`009-AT-ADR` (substrate boundary the pattern is routed through), `040-AT-ADR`
(prior epic-02 reconciliation). Contracts: `src/contracts/session-lease.ts`.
Bead: `agp-4na.2` under epic `agp-4na`.
