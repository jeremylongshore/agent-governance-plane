---
title: ADR — Transactional Outbox for Channel Delivery
date: 2026-06-21
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted
epic: agp-4na — Harden the governance-plane runtime with patterns from the peer-runtime audit
implements: agp-4na.3 (transactional outbox so channel deliveries survive restarts)
decision: Durable, retryable projection obligations + a startup drain; projection stays non-authoritative
---

# ADR — Transactional Outbox for Channel Delivery

> **Status: Accepted (CTO, 2026-06-21).** Implements `agp-4na.3` under epic
> `agp-4na`, building on the session lease (`041-AT-ADR`). Adds a durable,
> retryable channel-projection obligation + a startup poller so a best-effort
> projection is not silently lost across a daemon restart. Frozen-contract ADR.

## Context — and the scope guardrail

`ChannelAdapter.projectEvent` returns `false` on failure and the delivery is
gone. The peer-runtime audit's **transactional-outbox** pattern fixes this:
record a durable delivery obligation, then deliver and mark it sent; a poller
redelivers anything still pending after a restart.

The bead set a hard guardrail (echoing `002-PP-PLAN` §2.4 / `018` / `022`):
**projection is best-effort, one-way, and NEVER authoritative.** The outbox must
make delivery *durable*, not *authoritative* — an undelivered obligation must
never block governance, and a Slack message must never become part of the audit
record. **`channel-adapter.ts` is not touched** (its `projectEvent → false`
swallow is an intentional invariant); the outbox *wraps* projection, it does not
change the contract.

Post-v0 status: this carried the same 2026-06-03 post-v0 hold as `agp-4na.2`,
conditioned on the daemon/gateway epics landing. That condition is met (v0
shipped; this is `039-PP-ROAD` item #2's second half), so the hold is lifted —
same rationale recorded in `041-AT-ADR`. Honest scope: this adds reply/projection
**redelivery** (operational reliability), not the audit guarantee — the signed
journal is already crash-durable.

## Decision

1. **`OutboxDelivery` contract** (`src/contracts/outbox-delivery.ts`, frozen) — a
   durable projection obligation: `id` (idempotency key), `eventKind`, `summary`,
   `status` (pending|delivered), `attempts`, timestamps.
2. **`OutboxStore`** (`src/daemon/outbox-store.ts`) — the interface,
   `InMemoryOutboxStore` (reference/tests), and `FileOutboxStore`
   (`$AGP_HOME/outbox.json`); `enqueue` (idempotent on `id`) / `pending` /
   `recordAttempt` / `markDelivered`.
3. **`OutboxRelay`** (`src/daemon/outbox-relay.ts`) — the delivery path.
   `project(eventKind, summary)` enqueues a durable obligation **first**, then
   attempts delivery; a failed/declined/throwing attempt leaves it pending (it is
   never silently dropped). `drain()` is the poller — it redelivers every pending
   obligation and is called on daemon startup. **The relay never throws**, so the
   best-effort, non-authoritative projection invariant is preserved.

`run.ts` wires it: construct a `FileOutboxStore`-backed relay, `drain()` on
startup (redeliver obligations held over a prior crash), and project the session
boundary through it. The daemon's heavily-tested gate loop is **not** modified.

## Delivery semantics

**At-least-once.** A crash between a successful channel post and the
delivered-mark causes a redelivery (a duplicate) on the next `drain()`. The
obligation's `id` is stable across redeliveries, so a consumer dedups on it.
Exactly-once is explicitly out of scope (it would require channel-side
idempotency AGP cannot assume) and is unnecessary: projection is non-authoritative.

## Consequences

- A new durable surface (`$AGP_HOME/outbox.json`); a corrupt file reads empty so
  it can never crash the daemon (recovery still runs against `{}`).
- The signed journal remains the only source of truth; the outbox is strictly a
  delivery-reliability layer on top of best-effort projection.
- The frozen `OutboxDelivery` contract joins the others — breaking changes need a
  Bead + ADR.
- Completes the runtime-hardening epic's buildable children (`.1`, `.2`, `.3`,
  `.4` done; `.5` is a P3 eval).

## References

`041-AT-ADR` (session lease this builds on), `002-PP-PLAN` §2.4 (projection
non-authoritative), `018-AT-CONT` / `022-AT-ARCH` (channel-adapter projection
invariant), `039-PP-ROAD` (item #2). Contracts: `src/contracts/outbox-delivery.ts`.
Bead: `agp-4na.3` under epic `agp-4na`.
