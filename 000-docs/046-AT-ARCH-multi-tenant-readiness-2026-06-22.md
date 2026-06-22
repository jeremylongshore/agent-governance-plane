---
title: Multi-Tenant Readiness — Future Per-Tenant Isolation Boundaries (Reserved at v0, Disabled)
date: 2026-06-22
author: Jeremy Longshore
type: Architecture (design-only readiness map)
status: Design-only (nothing enabled at v0)
epic: agp-pne — Prepare AGP for multi-tenant isolation without enabling unsafe hosted multi-tenant operation (GitHub #17, Epic 14)
---

# Multi-Tenant Readiness — Future Per-Tenant Isolation Boundaries

## Status

DESIGN-ONLY. This document describes a FUTURE architecture. None of it is enabled
at v0. AGP v0 is single-operator, single-tenant. Hosted multi-tenant operation is
deferred to v0.3+ and requires its own epic plus the security gates listed in the
companion ADR (`047-AT-ADR`, multi-tenant gate). This doc exists so that the reserved
schema slots and the daemon seams are documented BEFORE anyone is tempted to wire
them up — reserving is free, retrofitting is not (AT-DECR Q4, CISO-locked).

## What is reserved today (and stays null/disabled)

The journal contract already reserves four future columns. They are present in the
schema from the first commit and default to `null`; populating them later is, by
construction, not a breaking change.

Source of truth: `src/contracts/journal-event.ts` — `ReservedFutureFields` and
`RESERVED_FIELD_NAMES`.

| Field | v0 state | Lights up when |
|-------|----------|----------------|
| `tenant_id` | `null` | Per-tenant scoping lands (this readiness track reserves it; v0.3 activates) |
| `signing_key_id` | `null` | Per-tenant / rotated signing keys land (single-key era at v0 records nothing here) |
| `approval_binding_type` | `null` | Approval-binding feature records how an approval was bound (nonce / WebAuthn) |
| `intendant_identity_uri` | populated when a verifier mints a URI; `null` otherwise | Already wired — the daemon threads a verified intendant URI through `AppendInput` (`043-AT-ADR`) |

Only `intendant_identity_uri` is threaded today; `tenant_id`, `signing_key_id`, and
`approval_binding_type` are written `null` in `Journal.append()`. The append is
unconditional, so every event carries all four columns — the schema is uniform across
the chain, which is what makes later population non-breaking. (`agp-pne.2` added the
optional `AppendInput.tenant_id` seam + a round-trip migration test; the daemon still
writes `null`.)

## The isolation boundaries (FUTURE — not built here)

Cannon-2 (`004-AR-CANN`) is explicit: multi-tenancy is the WHOLE isolation story; one
missed check is a cross-tenant compromise. The boundary therefore must be drawn at
EVERY per-tenant resource, not just the journal id. Each boundary below names the exact
v0 single-tenant primitive it would later scope, so the future seam is unambiguous.

### 1. Per-tenant signing key

- v0 today: one operator key, one path. The crypto primitives
  (`generateSigningKeyPem`, `loadPrivateKey`, `signEd25519`, `verifyEd25519` in
  `src/runtime/crypto.ts`) are already tenant-agnostic — they take a `KeyObject`,
  not a path, so no crypto refactor is needed.
- Future: the key PATH resolution (in `src/config.ts`) gains a per-tenant segment,
  the daemon constructs one `Journal` per tenant with that tenant's key, and
  `signing_key_id` records which key signed each event. A new key starts a fresh
  signing era; because v0 leaves `signing_key_id` null, the offline verifier treats
  the journal as single-key — mixed-key chains are a v0.3+ concern the per-tenant-KMS
  gate must address first.

### 2. Per-tenant policy context

- v0 today: one `PolicyEngine`, one `policy.json`. `evaluate()` matches on
  `(tool, actor)` only — there is no tenant parameter, and that is correct: tenant
  routing belongs at the daemon layer, not inside the engine.
- Future: the daemon holds one `PolicyEngine` per active tenant and routes
  `gate()`/`mediate()` to the right engine by `tenant_id`. The `PolicyRule` /
  `PolicyEffect` contract is unchanged; only the routing layer becomes tenant-aware.
  Hard requirement: no cross-tenant rule leakage — tenant A's rules must never decide
  tenant B's call.

### 3. Per-tenant nonce / HITL secret

- v0 today: one in-memory `NonceStore` (`src/channels/slack/nonce-store.ts`), one
  bot token, one Slack workspace. The nonce algebra — mint, one-time consume, TTL
  expiry, replay rejection, message-id binding — is tenant-agnostic.
- Future: the channel adapter keys nonces per tenant (a `NonceStore` per tenant) and
  carries `tenant_id` in the Slack interaction payload so `awaitDecision()` routes a
  decision back to the correct tenant's store. The invariant: a nonce minted for
  tenant A can NEVER be consumed against tenant B. `approval_binding_type` would then
  record `"nonce"` (or a future scheme) per event.

### 4. Per-tenant journal scoping (`tenant_id`)

- v0 today: one `audit.log` + one signed head checkpoint per operator. Every event
  carries `tenant_id: null`.
- Future: each tenant gets its own journal file and signed head, instances are never
  shared, and the offline verifier verifies a tenant's chain in isolation.
  `AppendInput` already carries the optional `tenant_id` seam (`agp-pne.2`); a future
  daemon threads it instead of `null`. Old events (written with `null`) remain
  readable and verifiable — the migration is additive (proven by the `pne.2` test).

### 5. Per-tenant session leases (noted, not detailed)

The session-store lease algebra (acquire / heartbeat / release / reap, fencing
tokens, crash recovery — `041-AT-ADR`) is tenant-agnostic; future multi-tenant scopes
it via one store per tenant so a fencing token from one tenant cannot disturb another.
Detailed design belongs to the v0.3 activation epic.

## What this readiness track does NOT do

- It does NOT enable any hosted multi-tenant operation. There is one daemon process,
  one sandbox image, one Docker socket, one Slack workspace at v0 — all shared.
- It adds NO authentication or authorization layer. `tenant_id` is a label, not an
  access-control boundary, until the v0.3 activation epic lands real isolation.
- It changes NO transport. The gateway stays on the Unix socket (`029-AT-ADR`); the
  confused-deputy fix any non-socket transport requires is a v0.3 gate, not this work.

## The single allowed security statement

Per the repo's claim-control rule, public surfaces make exactly one security
statement — a signed audit log of every tool call. Nothing in this readiness track
adds a new assurance claim; reserving null columns and documenting a future seam
changes none of the v0 properties. This document is internal planning (`000-docs/`),
out of claim-scan scope, but it deliberately avoids stronger assurance language so it
can be quoted in public-facing copy without rework.

## Cross-references

- `013-AT-CONT` / `023-AT-SPEC` — journal-event contract (reserved fields)
- `041-AT-ADR` — session lease (the per-tenant lease seam)
- `043-AT-ADR` — intendant identity URI (the threading pattern this reuses)
- `044-AT-ADR` — frozen-actor guard (the static-guard pattern this reuses)
- `047-AT-ADR` — multi-tenant gate ADR (the single-tenant lock; companion)
- `004-AR-CANN` Cannon-2 — multi-tenancy is the whole isolation story
