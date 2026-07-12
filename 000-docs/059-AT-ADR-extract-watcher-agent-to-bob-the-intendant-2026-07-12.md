---
title: "ADR — Extract the watcher agent / composition layer out of AGP into bob-the-intendant"
date: 2026-07-12
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
stability: INTERNAL — unstable — no public RFC
epic: agp-eva.1 — Slice 0 (bead agp-eva.1.9)
status: Accepted
implements: intent-os 030-AT-DECR D2 (extraction) · executes the 057-AT-ADR extraction plan
governed-by: intent-eval-lab 109-AT-DECR (governed-judgment ruling — rename Intendants → Bob the Intendant; Public-Flip Gate)
supersedes: none (057-AT-ADR is the plan; this is the executed AGP-side move)
source: src/cli/index.ts · scripts/install.sh · tests/{RTM,TESTING,JOURNEYS,PERSONAS}.md
---

# ADR — Extract the watcher agent / composition layer out of AGP into bob-the-intendant

> **Status: Accepted (2026-07-12).** This ADR records the **AGP side** of the
> extraction: the trigger-woken **agent** and its operator surface leave AGP so
> the kernel stays a clean, contract-first governance plane. It performs no public
> flip and authorizes no public surface — the rename (`intendants` →
> `bob-the-intendant`), the public flip, and their timing override are recorded in
> **bob-the-intendant's own ADR** and governed by **intent-eval-lab `109-AT-DECR`**.

## Context

`057-AT-ADR` (the extraction *plan*) fixed *how* the composition plane would leave
AGP: the kernel stays; the plane moves to a repo that consumes AGP as a pinned
dependency; the dependency direction is leaf → kernel only. `030-AT-DECR` D2 gated
the move on the five-condition extraction gate (all met per `057`).

Two things changed the execution from the `057` framing, both from Jeremy's
build-in-public course-correction ratified in intent-eval-lab `109-AT-DECR`
(2026-07-12):

1. **The reserved repo is renamed.** `jeremylongshore/intendants` becomes
   `jeremylongshore/bob-the-intendant` (Q9; the "last rename"). The AGP per-harness
   **`intendant-adapter`** component name is **unchanged** — `109` Q9 binds the
   rename to marketing/repo/wordmark only; the frozen `intendant-*` contracts and
   `src/intendants/` stay exactly as they are.
2. **The demo/eval brain will be a public benchmark, not real GSB data.** That
   removes the council's #1 one-way-door risk (personal data in a public repo), so
   the *timing* of the extraction + public flip is brought forward — a decision
   recorded in `109-AT-DECR` §7 (the Public-Flip Gate) and in bob's ADR, not here.

This ADR is the mechanical, reversible AGP-side step: **delete the code that moved,
keep AGP green, re-anchor the retained requirements.**

## Decision — what leaves AGP, what stays

**Extracted to `jeremylongshore/bob-the-intendant`** (it composes AGP and owns the
agent/composition layer):

| Removed from AGP | Was |
|---|---|
| `src/triggers/github-watcher/` | the watcher agent: committed spec + human-commit gate, hash-chained state log, one-shot poll source, watcher intendant, notify, meaningfulness filter |
| `src/cli/commands/watch.ts` (+ test) | the `agp watch run/status/enable` operator surface |
| `templates/github-watcher/` | the per-agent template test pack (unit/policy/state/acceptance) |
| RTM REQ-043/045/046/047/048/049; Journey J2; the `run-governed-watch` persona flow | the watcher's traceability rows — moved to Bob's RTM/JOURNEYS/PERSONAS |

**Stays in AGP** — the kernel primitives the agent composes:

| Retained | Why it is kernel, not agent |
|---|---|
| `src/contracts/trigger-source.ts` (+ test) | a **frozen contract** (`056-AT-CONT`); AGP defines the interface, agents implement against it (RTM REQ-050) |
| `src/daemon/daemon.ts::runMediated` (+ `daemon-run-mediated.test.ts`) | the mediated-run loop — a trigger-woken intendant's every tool call is gated/journaled/sandboxed (RTM REQ-042) |
| `src/journal/cross-chain.ts` (+ test) | the cross-chain causal-pointer **primitive** (`058-AT-ADR`, bead agp-eva.1.2) — a journal/plane primitive; the watcher's `trigger.fired`/`trigger.settled` *use* of it moved (RTM REQ-044) |

This matches the design invariant Greptile enforces: **leaf layers must not import
the daemon; contracts stay frozen.** After this ADR the dependency edge that used
to be internal (`cli/commands/watch.ts` → `triggers/github-watcher/`) becomes a
cross-repo edge (`bob-the-intendant` → `agp` pinned dependency), pointing the
correct way (leaf → kernel).

## Consequences

- **AGP is the clean governance plane again.** `src/triggers/` and `templates/` are
  gone; the `agp` CLI drops the `watch` command; `install.sh` installs the plane
  and points at `bob-the-intendant` for governed agents.
- **No functional regression in the kernel.** Nothing outside the removed watcher
  imported it (only `watch.ts` did, and it moved too). Verified green on the
  extraction branch: `bun run typecheck` (0), `bun test` (360 pass / 8 skip / 0
  fail), `coverage-gate` (lines 94.46% ≥ 90, funcs 91.80% ≥ 88), `bun run lint`
  (clean), `claim-scan`, `doc-drift`, `audit-harness verify` + `escape-scan`. The
  hash-pinned surfaces `tests/RTM.md` + `tests/TESTING.md` were edited and
  deliberately re-pinned (`scripts/audit-harness init`).
- **Operational cutover (prod-impact).** The live cron
  `~/bin/intendants-release-watch.sh` (09:15 daily → #intent-notifier) invoked
  `agp watch` from AGP `main`. It is repointed to Bob's CLI **before** this removal
  merges, so the AGP merge does not break the running watcher. (Order: Bob green +
  cloned locally + cron repointed → merge Bob → merge AGP.)
- **Traceability preserved, not deleted.** The moved RTM/journey/persona rows are
  re-homed in Bob's docs; AGP's docs carry an explicit extraction note pointing to
  Bob and to this ADR, so a future reader reconstructs the split.

## Non-goals / not authorized here

- **The rename and the public flip.** Recorded in `bob-the-intendant`'s ADR and
  governed by `109-AT-DECR` §7 (the Public-Flip Gate: frozen cross-chain contract
  signed-in, runnable slice + bundled public-benchmark brain, PII/secret scrub
  gate, in-repo claim-control, signing/npm provisioned, trademark clearance +
  fallback, supersession recorded, honest THREAT-MODEL). This ADR opens none of
  those doors.
- **Any change to the frozen `intendant-*` contracts or `src/intendants/`.** The
  `109` Q9 rename is wordmark-only; the adapter component name is unchanged.

## Revisit triggers

- If AGP ever needs the watcher back in-tree (it should not): a Bead + ADR event.
- If a second trigger source lands, it lands in `bob-the-intendant` against the
  retained `trigger-source` contract — AGP only changes if the *contract* changes
  (Bead + ADR).

## References

- Plan: `057-AT-ADR` (extraction readiness + plan) · `054-PP-ROAD` (composition-plane roadmap)
- Primitive retained: `058-AT-ADR` (cross-chain causal pointer) · `056-AT-CONT` (trigger-source contract)
- Governing decisions: intent-os `030-AT-DECR` (D1 naming, D2 extraction gate, D3 dark-until-green) · intent-eval-lab `108-AT-ARCH` + `109-AT-DECR` (governed-judgment layer; rename; Public-Flip Gate)
- Bob-side record: `bob-the-intendant/000-docs` extraction-timing-override + rename ADR
- Beads: `agp-eva.1.9` (this AGP-side removal) · epic `agp-eva.1`
