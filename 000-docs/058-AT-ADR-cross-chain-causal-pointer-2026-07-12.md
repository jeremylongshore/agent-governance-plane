---
title: "ADR: Cross-chain causal pointer (journal ↔ GSB receipt)"
date: 2026-07-12
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
stability: INTERNAL — unstable — no public RFC
epic: agp-eva.1 — Slice 0 (bead agp-eva.1.2)
status: Accepted
supersedes: none
governed-by: intent-eval-lab 109-AT-DECR (governed-judgment ruling — the mandated first build action)
source: src/contracts/journal-event.ts · src/journal/journal.ts · src/journal/cross-chain.ts
---

# ADR: Cross-chain causal pointer (journal ↔ GSB receipt)

**Status:** Accepted (2026-07-12) · **Bead:** `agp-eva.1.2` · **Advances:** `iel-25a.4` (governed-judgment Layer 1)

> **Semantic clarification (2026-08-17, bead `agp-8m6`):** the historical
> "causal pointer" name and signed wire fields remain unchanged. The current
> `gsb_receipt_tip_hash` proves an observed position in the global Bob's Big Brain
> governance chain. It does not identify an exact query read set or establish that
> retrieved content caused an action.

## Context

A governed run can touch two hash chains: AGP's signed journal records **what the
agent did**; Bob's Big Brain records deterministic governance transitions in its
global receipt chain. Nothing linked an action to the governance-chain position the
run observed. The pointer closes that structural gap. The brain does not yet mint a
durable per-query receipt for the exact `qmd://` results presented to an agent.

> **Naming:** GSB (Governed Second Brain — since 2026-07-10 productized as **Bob's Big
> Brain**: umbrella `intent-solutions-io/bobs-big-brain-umbrella`, engines
> `jeremylongshore/bobs-big-brain-compiler` + `jeremylongshore/bobs-big-brain-registrar`,
> plugin `jeremylongshore/bobs-big-brain-plugin`). Wire identifiers such as
> `gsb_receipt_tip_hash` deliberately keep the GSB name — they are frozen contract
> fields, not renamed.

This is the **first build action** mandated by the ratified governed-judgment ruling
(`intent-eval-lab/000-docs/109-AT-DECR`): the CTO seat bound *"freeze the journal↔receipt
contract + `correlation_id` + GSB tip-hash before any judgment run,"* and the CISO
seat bound that the pointer must be **signed-in** (covered by the Ed25519 signature),
not merely embedded — otherwise forging a fake-parent lineage costs nothing. It is
also an already-filed AGP Slice-0 invariant (`agp-eva.1.2`), because the append-only
journal **cannot be retrofitted**: any run recorded before the field exists is
permanently unprovable. Cheap now; unrecoverable later.

The journal already carries a `correlationId` at the trigger boundary
(`TriggerEvent.correlationId`, `056-AT-CONT`), and already uses a reserved-field
pattern that makes additive fields non-breaking (`013-AT-CONT`).

## Decision

Add two **active** fields to the `JournalEvent` contract, present from this commit and
`null` by default:

- **`correlation_id`** (`string | null`) — the shared id linking a journal entry to its
  governed run and the GSB receipt. Sourced from `TriggerEvent.correlationId`. `null`
  for uncorrelated (genesis/admin) events.
- **`gsb_receipt_tip_hash`** (`sha256 | null`) — the global brain governance-chain tip
  observed at decision time. `null` when no tip was stamped. This is not a query
  result-set hash.

They are **distinct from the reserved future-field lock** (they are populated now, not
reserved for later), tracked by their own `CROSS_CHAIN_FIELD_NAMES` export.

**Signed-in for free.** The journal hashes and signs `prevHash ‖ canonicalJson(event
sans hash+signature)`, and the verifier recomputes over the same bytes
(`const { hash, signature, ...rest } = ev`). Any field on the event is therefore inside
the signed bytes. `canonicalJson` sorts keys deeply, so placement is irrelevant. **No
new signing machinery** — the fields inherit tamper-evidence from the existing chain.

A pure projection, `reconstructGovernanceTipsAt(events, correlationId)`
(`src/journal/cross-chain.ts`), returns a run's actions plus the distinct governance
tips stamped into them. The old `reconstructKnowledgeAt` export remains as a deprecated
compatibility alias. The projection fails closed on an empty `correlationId` (a
malformed query must not masquerade as a clean empty result).

## Alternatives considered

- **A nested `cross_chain` object** — rejected: the reserved causal columns
  (`tenant_id`, `intendant_identity_uri`, `on_behalf_of`) are flat top-level fields;
  matching that keeps the shape uniform and the canonical bytes flat.
- **A sidecar index file mapping correlation_id → events** — rejected: a sidecar is not
  covered by the journal signature, so it would be forgeable (the exact failure the CISO
  binding forbids). The pointer must live *in* the signed event.
- **Make `correlation_id` required (non-null)** — rejected for v0: genesis/admin events
  have no run; `min(1).nullable()` distinguishes *uncorrelated* (`null`) from *malformed*
  (`""` is rejected) without forcing a synthetic id onto non-run events.
- **Defer until GSB is wired** — rejected: the append-only journal cannot be retrofitted;
  the field must exist before the first governed run or that run is unprovable forever.

## Consequences

- **Positive:** action→observed-governance-position correlation is signed into the AGP
  event and reconstructable after journal verification. The brain can resolve the
  stamped hash against its own verified chain.
- **Cost:** two always-present nullable columns on every event (bytes are negligible).
- **Non-breaking:** additive nullable fields; the strict schema still rejects unknown
  fields; existing journals parse (the fields default `null`).
- **Follow-on:** Registrar bead `qmd-team-intent-kb-1fx` shipped authenticated
  `GET /api/audit/receipt-tip`, so a stamped governance tip can now be minted and
  resolved. Exact content-safe per-query read-set evidence remains Registrar bead
  `qmd-team-intent-kb-sdg`; it must be a distinct pointer and must not be inferred
  from the global tip.

## Verification

`bun run typecheck` clean · `bun test src/journal src/contracts/journal-event.test.ts`
green, including: the pointer round-trips through `append`; a **forged GSB tip breaks
both hash and signature** (signed-in proof); `reconstructGovernanceTipsAt` projects a
run's actions plus deduped observed tips and fails closed on an empty id; the deprecated
`reconstructKnowledgeAt` name remains a compatibility alias.
