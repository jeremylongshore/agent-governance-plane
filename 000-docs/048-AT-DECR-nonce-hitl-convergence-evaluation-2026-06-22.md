---
title: DECR — Nonce-HITL Shared-Kernel Convergence Evaluation (re-evaluated at the second-harness trigger)
date: 2026-06-22
author: Jeremy Longshore
type: Decision Record (evaluation of a watch/tripwire bead)
status: Accepted — DEFER convergence
bead: agp-4na.5
---

# DECR — Nonce-HITL Shared-Kernel Convergence Evaluation

## Status

Accepted (CTO, 2026-06-22). Decision: **DEFER** convergence; **no follow-up epic
filed**. This closes the `agp-4na.5` tripwire by performing the evaluation it was
created to perform at its named trigger.

## Why this evaluation runs now

`agp-4na.5` is a watch bead: AGP and CCSC each implement nonce-bound Slack HITL
independently —

- **CCSC**: cross-channel admin verbs (the substrate).
- **AGP**: Block-Kit approval of policy `require` verdicts
  (`src/channels/slack/nonce-store.ts` + `interactions.ts`).

`009-AT-ADR` named a shared-kernel convergence ("Option D" — a shared package both
repos consume) as the end-state, **trigger-gated on a real second consumer**. The
bead's conflict-review recorded the trigger as *the second harness (`agp-cln`)* with
"re-evaluate when `agp-cln` lands." `agp-cln` has landed (Codex intendant + the
contract-conformance and concurrent-session tests). So the evaluation runs now.

## Findings

1. **The second harness added NO new nonce-HITL implementation.** The Codex
   intendant reuses AGP's *single* `NonceStore` and `SlackChannel` unchanged — the
   concurrent-session test (`agp-cln.3`) drives both Claude and Codex through one
   `NonceStore` in one channel. The implementation count is still two (CCSC admin +
   AGP approval), exactly as before `agp-cln`. The second harness did not create the
   duplication pressure convergence would relieve.

2. **The two implementations are parallel uses of a pattern, not duplicated code.**
   CCSC's admin-verb nonce-HITL and AGP's policy-`require` approval nonce-HITL share
   the *algebra* (mint → one-time consume → TTL expiry → replay rejection → binding;
   peer-bot rejection without consuming) but serve different surfaces. AGP already
   hardened its own (`022-AT-ARCH`, the concurrent-session guarantees). There is no
   live maintenance pain from two consumers of one shared module — because there is
   no shared module yet, by design.

3. **The real Option-D trigger has not fired.** `009-AT-ADR`'s Option D is a shared
   *kernel package*; `040-AT-ADR` (substrate reconciliation) ratified
   reimplementation ("adapt-and-harden") for v0 and **kept Option D gated on a real
   shared-package consumer** — the natural moment being a future extraction of the
   CCSC kernel into `@intentsolutions/ccsc-kernel` that both AGP and CCSC import. A
   second *harness* is not a second *kernel-package consumer*. That trigger is
   already tracked under `040-AT-ADR` / the `agp-cln` Option-D end-state note.

## Decision

**Defer convergence.** Converging the two nonce-HITL implementations into a shared
kernel now would be speculative (the bead forbids speculative convergence) and would
spend CCSC refactor budget for zero current second-consumer benefit. The forward
trigger — a real shared-package extraction — already lives in `040-AT-ADR`; when it
fires, the nonce-HITL algebra is a natural early member of that package, and a fresh
epic will carry it. No new tripwire bead is needed because `040-AT-ADR` is the
durable record of the Option-D gate.

## Consequences

- No code change; no follow-up epic now. AGP keeps its hardened in-repo nonce-HITL;
  CCSC keeps its admin nonce-HITL.
- The `agp-4na.5` tripwire is retired (its trigger evaluated); the Option-D forward
  trigger is carried by `040-AT-ADR`, not a perpetual open watch bead.
- No public claim changes.

## References

`009-AT-ADR` (Option-D shared-package end-state), `040-AT-ADR` (substrate
reconciliation; Option-D gate forward record), `022-AT-ARCH` (HITL approval flow),
`044-AT-ADR` (second harness, which reused AGP's nonce-HITL). Bead: `agp-4na.5`.
