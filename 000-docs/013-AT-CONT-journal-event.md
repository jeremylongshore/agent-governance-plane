---
title: "Contract: JournalEvent"
date: 2026-06-01
author: Jeremy Longshore
type: Contract (CONT)
stability: INTERNAL — unstable — no public RFC
epic: Epic 03 — core contracts (bead agp-nsd)
source: src/contracts/journal-event.ts
---

# Contract: JournalEvent

**INTERNAL — unstable — no public RFC.** AGP-internal contract; not a published
interface at v0.

One record in AGP's authoritative, hash-chained, Ed25519-signed audit journal.
Aligned with the CCSC `journal.ts` substrate (signed v2 events) that AGP vendors
per ADR [`009-AT-ADR`](009-AT-ADR-ccsc-substrate-extraction-strategy.md).

## Shape

| Field | Type | Notes |
|-------|------|-------|
| `v` | `2` | v0 emits signed v2 events only |
| `seq` | int ≥ 1 | monotonic per chain |
| `ts` | ISO-8601 | event time |
| `prevHash` | sha256 hex \| `null` | null only for the genesis event |
| `hash` | sha256 hex | over `prevHash ‖ canonicalJson(event sans hash+signature)` |
| `kind` | string | e.g. `tool_call.allow`, `approval.granted` |
| `actor` | `session_owner \| claude_process` | only trusted actors |
| `payload` | object | redacted, structured |
| `signature` | base64 Ed25519 (88 ch) | signs the bytes `hash` covers |

## Reserved future fields (council non-negotiable — CISO-locked, AT-DECR Q4)

`tenant_id`, `signing_key_id`, `approval_binding_type`, `intendant_identity_uri`,
`on_behalf_of` are present in the schema from the first commit and are **`null` at
v0**. Reserving them now means populating them later (multi-tenant, per-tenant
KMS, approval binding, Sigstore intendant identity, and the human accountability
principal) is **not** a breaking change. The contract test asserts all five are
present and null.

`on_behalf_of` records the **human principal** on whose authority an action runs
— "Claude acting on behalf of `<human>`". It was reserved per the thinker-canon
board review of the authority model (`agp-dxp` / issue #115, recorded in
`052-AR-BORD`): the signed, hash-chained journal is the only **irreversible**
artifact, so the principal slot must exist before the multi-tenant authority
model lands. **Accountability data only — it records *who*, and MUST NOT be read
to make an authorization decision** (that re-complects accountability with
authority).

## Invariants

- Signed-only at v0: a `v:1` (unsigned) event is rejected.
- Strict schema: unknown fields are rejected.
- The local journal is **authoritative** (the Slack channel is only a projection).

## Stability

INTERNAL and unstable. Any breaking change (field removal/rename, type change,
loosening a reserved-field lock) requires **a Bead + an ADR** before it lands.
Additive, backward-compatible changes (new optional field, populating a reserved
field) need a Bead.
