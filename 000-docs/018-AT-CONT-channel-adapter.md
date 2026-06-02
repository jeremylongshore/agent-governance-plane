---
title: "Contract: ChannelAdapter"
date: 2026-06-01
author: Jeremy Longshore
type: Contract (CONT)
stability: INTERNAL — unstable — no public RFC
epic: Epic 03 — core contracts (bead agp-nsd)
source: src/contracts/channel-adapter.ts
---

# Contract: ChannelAdapter

**INTERNAL — unstable — no public RFC.**

The contract for the human-in-the-loop approval channel (Slack is the v0
implementation). The control plane posts approval requests for policy `require`
verdicts, awaits the human decision, and projects selected journal events.

## Interface

| Member | Signature | Purpose |
|--------|-----------|---------|
| `postApprovalRequest` | `(ApprovalRequest) => Promise<ApprovalHandle>` | ask the human |
| `awaitDecision` | `(handle) => Promise<ApprovalDecision>` | block for the decision |
| `projectEvent` | `(kind, summary) => Promise<boolean>` | best-effort mirror |

## Invariants

- **Projection, not authority** (inherited from CCSC): the local hash-chained
  journal is ground truth. `projectEvent` returns whether delivery happened; a
  `false` (dropped / rate-limited) NEVER changes what the journal records.
- An `ApprovalRequest` may only be raised for a `require` verdict — the schema
  rejects an `allow`/`deny` verdict.

## Stability

INTERNAL and unstable. Breaking changes require **a Bead + an ADR**.
