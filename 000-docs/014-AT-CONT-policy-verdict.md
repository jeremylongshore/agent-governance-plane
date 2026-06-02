---
title: "Contract: PolicyVerdict"
date: 2026-06-01
author: Jeremy Longshore
type: Contract (CONT)
stability: INTERNAL — unstable — no public RFC
epic: Epic 03 — core contracts (bead agp-nsd)
source: src/contracts/policy-verdict.ts
---

# Contract: PolicyVerdict

**INTERNAL — unstable — no public RFC.**

The decision the policy engine returns for a single tool call. Three kinds,
mirroring the CCSC `policy.ts` substrate.

## Shape

| Field | Type | Notes |
|-------|------|-------|
| `decision` | `allow \| deny \| require` | `require` = human approval needed before the call proceeds |
| `reason` | string | justification; surfaced in the journal and (for `require`) Slack |
| `ruleId` | string \| `null` | matching rule; null = no rule matched (default path) |
| `tier` | `default \| workspace \| user \| admin` \| `null` | tier of the matching rule |

## Invariants

- **Fail-closed:** a `require` verdict MUST name the `ruleId` that demands
  approval — a `require` with `ruleId: null` is rejected by the schema.
- A no-rule-matched `allow` defaults `ruleId` and `tier` to `null`.

## Stability

INTERNAL and unstable. Breaking changes (new decision kind, removing/renaming a
field, changing the fail-closed invariant) require **a Bead + an ADR**.
