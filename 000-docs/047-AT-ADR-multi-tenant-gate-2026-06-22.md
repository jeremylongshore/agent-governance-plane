---
title: ADR — Multi-Tenant Gate: v0 Is Single-Tenant Only, Fail-Closed Guard, Hosting Requires a Future Epic
date: 2026-06-22
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted
epic: agp-pne — Prepare AGP for multi-tenant isolation without enabling unsafe hosted multi-tenant operation (GitHub #17, Epic 14)
decision: v0 single-tenant only; a two-layer fail-closed guard blocks accidental hosted multi-tenant; hosting requires a future epic + security gates
---

# ADR — Multi-Tenant Gate: v0 Is Single-Tenant Only

## Status

Accepted (CTO, 2026-06-22). Supersedes nothing. Companion to `046-AT-ARCH`
(multi-tenant readiness).

## Context

The ISEDC council locked single-tenant for v0 (`001-AT-DECR`). The reasons are
recorded verbatim there: a smaller threat surface to defend at launch (CISO), and a
single dogfooding buyer that needs no sales / support / multi-tenant-rewrite motion
(CTO). The version ladder (`002-PP-PLAN`) places multi-tenant primitives at v0.1+
(prep) and v0.3 (per-tenant KMS-backed keys + multi-tenant `gate()` rewrite + the
confused-deputy fix any non-socket transport requires), and the hosted plan for
self-hosters not before the first public-surface checkpoint.

The adversarial review is blunt (`004-AR-CANN`, Cannon-2): multi-tenancy is the WHOLE
isolation story; one missed check is a cross-tenant compromise. The safe posture is
therefore RESERVE, DO NOT ENABLE. The real risk this ADR addresses is not malice —
it is accident: a future contributor (or a copied deployment) flipping on a
half-built multi-tenant path and silently running an un-isolated hosted service.

## Decision

1. **v0 runs single-tenant ONLY.** There is exactly one tenant context. Its id is the
   sentinel `v0-single-operator` (`src/tenants/tenant.ts`). No code path may set a
   different tenant id at v0.

2. **A fail-closed runtime guard refuses any non-sentinel tenant.** `assertTenantContext`
   throws (`[FAIL-CLOSED]`) if `tenantId !== SINGLE_TENANT`. It is called at the top of
   every governance entry point in the daemon — `mediate`, `runLive`, `runScripted` —
   before any spawn or mediation. Fail mode is throw-and-halt: the session is rejected,
   nothing is spawned, no decision is mediated. The daemon's `tenantContext` dep is
   optional and defaults to the sentinel, so existing single-tenant constructions are
   unchanged; only an explicit non-sentinel context trips the guard.

3. **A static guard test forbids any multi-tenant enablement toggle in `src/`.** A
   `bun test` scan (via `node:fs`, mirroring the frozen-actor guard in
   `src/intendants/codex/frozen-actor.test.ts`) fails the suite — and therefore CI and
   the pre-commit L1 hook — if a token like `ENABLE_MULTI_TENANT` / `enableMultiTenant`
   / `ENABLE_HOSTED` / `isMultiTenant` / `isHosted` appears in source. This is the
   primary defense against a hosting flag being sneaked in; the runtime assert is the
   second line.

4. **The schema slot already exists and stays null.** `tenant_id` is reserved in
   `journal-event.ts` and written as `null` by `Journal.append()` at v0. This ADR does
   NOT change that; `agp-pne.2` added the optional, default-null `AppendInput.tenant_id`
   seam (with a round-trip migration test) so the field can be populated later without
   a schema break — the daemon still threads `null`.

5. **Hosted multi-tenant requires a future epic plus security gates — EXPLICITLY.**
   This epic does not, under any circumstance, ship a hosted multi-tenant surface.
   Enabling hosted operation requires, at minimum:
   - a dedicated activation epic (the first public-surface gate);
   - per-tenant KMS-backed signing keys (v0.3 gate) — not one process-global key;
   - the multi-tenant `gate()` rewrite with the confused-deputy fix REQUIRED before
     transport leaves the Unix socket (v0.3 gate);
   - per-tenant approval-binding (records `approval_binding_type`);
   - intendant identity provenance hardening (the Sigstore-by-v0.6 path, `043-AT-ADR`);
   - per-tenant isolation of policy, nonce/HITL secret, and journal — every boundary
     in `046-AT-ARCH`, because Cannon-2 means a single missed boundary is a compromise.

## Consequences

- **Positive.** Accidental hosted multi-tenant is blocked at two independent layers
  (runtime + static/CI), neither of which a single careless edit can defeat. The
  reserved column means future activation is additive, not a breaking migration. The
  guard text names the lock and the unlock condition, so the next reader knows exactly
  why and when it lifts.
- **Cost.** A small amount of plumbing (a tenant model module, an optional
  `tenantContext` dep on the daemon, three assert call sites, one optional
  `AppendInput` field). The `frozen-actor` precedent shows the cost is low and the
  pattern is already trusted in this repo.
- **Honest limitation.** The guard prevents ACCIDENTAL enablement; it is not an
  isolation mechanism and makes no isolation claim. Real isolation is the v0.3+ work
  this ADR explicitly defers. Nothing here adds a public security claim — the one
  allowed statement (a signed audit log of every tool call) is unchanged.

## Alternatives considered

- **Do nothing (rely on "we just won't ship it").** Rejected: leaves accidental
  enablement one merge away, with no CI tripwire — exactly the Cannon-2 failure mode.
- **Build the real per-tenant isolation now.** Rejected: out of scope, un-gated, and
  the council locked it to v0.3+. Building it half-way is more dangerous than not
  building it (an un-isolated hosted path that LOOKS done).

## References

`046-AT-ARCH` (readiness — the future boundaries), `001-AT-DECR` (single-tenant lock),
`002-PP-PLAN` (version ladder), `004-AR-CANN` Cannon-2, `029-AT-ADR` (Unix-socket
gateway), `043-AT-ADR` (intendant identity), `044-AT-ADR` (frozen-actor guard
pattern). Beads: `agp-pne` (GitHub #17), children `agp-pne.1`/`.2`/`.3`.
