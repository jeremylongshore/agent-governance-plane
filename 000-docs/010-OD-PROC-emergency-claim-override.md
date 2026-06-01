---
title: Emergency Claim-Override Procedure
date: 2026-06-01
author: Jeremy Longshore
type: Operational Procedure (PROC)
epic: Epic 11 — AGP claim-control enforcement (bead agp-6mq)
status: Active
---

# Emergency Claim-Override Procedure

## Scope

This procedure governs the **only** sanctioned way to bypass the claim-control
gate (`scripts/claim-scan.sh` against the `MARKETING_CLAIMS.md` registry). It
applies whenever someone needs to either:

1. Use a term currently on the banned list on an AGP-public surface, or
2. Publish a security/marketing claim **before** its backing primitive ships.

The default answer to both is **no**. This procedure exists so that the rare
legitimate exception leaves an auditable trail instead of a silently weakened
gate.

## Non-negotiables

- **Operator approval is mandatory.** Jeremy (operator / decision owner) must
  approve every override explicitly. No agent and no contributor may self-approve.
- **CISO veto stands.** The CISO seat may veto any claim addition or override
  regardless of operator approval; per council Q4 this authority is not
  overridable inside this procedure.
- **A claim never ships ahead of its primitive without a recorded override.**
  The whole point of the registry is that wording does not outrun what AGP
  actually does.

## Procedure

1. **Open a Bead** describing the exact claim/term, the surface it will appear
   on, and why the exception is justified. Plain-English title; link the relevant
   epic (`agp-6mq`).
2. **Record operator approval on that Bead** — Jeremy annotates the Bead
   (`bd note`) with an explicit approval and the rationale. This annotation is the
   load-bearing audit record.
3. **Choose the smallest change:**
   - *Preferred:* if the primitive now ships, add an allowed-claim row to
     `MARKETING_CLAIMS.md` for the current version with its backing primitive, and
     (if the term was on the banned list) remove it from the banned-regex block in
     the same PR. The gate stays fully enforcing; the claim is now simply allowed.
   - *Exceptional / time-boxed:* if a claim must appear before its primitive (it
     should not), the override PR must cite the approving Bead in its body and set
     an explicit expiry condition. This path is discouraged and must be rare.
4. **Reference the Bead in the PR** that touches `MARKETING_CLAIMS.md` or any
   public surface carrying the claim. The PR description states "claim override —
   approved in &lt;bead&gt;".
5. **CISO review.** The CISO seat reviews the override PR; a veto blocks merge.

## What is NOT an override

- Adding a claim **when its primitive ships** is normal registry maintenance, not
  an override — register it in the same PR that ships the primitive.
- Editing internal `000-docs/` planning/audit prose is out of the gate's scope
  (the scanner does not block those); it needs no override.

## Audit trail

Every override is reconstructable from: the approving Bead (operator annotation),
the registry diff (`MARKETING_CLAIMS.md` history), and the PR that cites the Bead.
If any of those three is missing, the override was not sanctioned.
