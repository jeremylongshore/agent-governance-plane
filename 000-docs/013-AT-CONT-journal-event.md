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
| `correlation_id` | string \| `null` | cross-chain pointer — shared run id (`TriggerEvent.correlationId`, 056-AT-CONT); null if uncorrelated |
| `gsb_receipt_tip_hash` | sha256 hex \| `null` | GSB receipt-chain tip observed at decision time; null if no brain read grounded the action |

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

## Cross-chain causal pointer (agp-eva.1.2 · 058-AT-ADR)

`correlation_id` and `gsb_receipt_tip_hash` bind this journal ("what the agent
did") to the GSB receipt chain ("what the agent knew"), so **"what did it know
when it acted X?"** is answerable. GSB (Governed Second Brain — since 2026-07-10
productized as **Bob's Big Brain**: umbrella
`intent-solutions-io/bobs-big-brain-umbrella`, engines
`jeremylongshore/intentional-cognition-os` + `jeremylongshore/qmd-team-intent-kb`,
plugin `jeremylongshore/bobs-big-brain-plugin`); the `gsb_` field prefix keeps the
pre-rename name because it is a frozen wire contract. **Unlike** the reserved fields above, these are
**active** — populated at decision time: `correlation_id` from the governed run's
`TriggerEvent.correlationId`, and `gsb_receipt_tip_hash` from the GSB receipt tip
observed when a brain read grounds the action. Both are **present from the first
commit** and default `null` (no correlation / no brain read).

Because they live inside the hashed + signed canonical bytes (the verifier hashes
the event sans `hash`+`signature`), the pointer is **signed-in, not merely
embedded** — forging a fake-parent lineage must break both the hash and the
signature (109-AT-DECR CISO binding; forgery cost > 0). The append-only journal
cannot be retrofitted, so any run recorded before the field existed would be
permanently unprovable — hence born from the first commit. `reconstructKnowledgeAt`
(`src/journal/cross-chain.ts`) projects a run's actions + observed GSB tips for the
joint AGP-`verify` ⋈ GSB-`ico audit` reconstruction.

## Invariants

- Signed-only at v0: a `v:1` (unsigned) event is rejected.
- Strict schema: unknown fields are rejected.
- The local journal is **authoritative** (the Slack channel is only a projection).

## Stability

INTERNAL and unstable. Any breaking change (field removal/rename, type change,
loosening a reserved-field lock) requires **a Bead + an ADR** before it lands.
Additive, backward-compatible changes (new optional field, populating a reserved
field) need a Bead.
