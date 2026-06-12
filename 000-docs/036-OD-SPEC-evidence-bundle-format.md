# 036 — Evidence-Bundle Format (AGP)

Defines the closure evidence required for every bead, epic, and release. Epic 15
(`agp-upt`) deliverable. The rule: **no bead closes without evidence, no epic
closes without an AAR, no release closes without a validated bundle.** Evidence
lives where it is checkable later — on the bead, in the PR, and in `000-docs/`.

## Bead-closure evidence (every bead)

A closed bead's `--reason` (or a `bd note`) MUST carry:

- **PR number** that landed the work (e.g. `PR #67`).
- **Release/version** it shipped in, when applicable (e.g. `v0.1.46`).
- **What shipped** — a one-paragraph factual summary (files/behavior, not aspiration).
- **Validation evidence** — which gates passed, and any key numbers
  (e.g. `coverage funcs 89.26% / lines 91.86%`, `boundary test proves X`).

A silent open→close with no reason is a closure-discipline violation.

## Epic-closure evidence (every epic)

In addition to all child beads being closed with evidence:

- **An AAR** at `000-docs/NNN-RA-AAR-<epic>-<date>.md` (from template
  `011-OD-TMPL-aar-template.md`).
- The epic bead closed with a reference to the AAR and the PR(s) that shipped it.
- If any child is intentionally **not** done (deferred/post-v0), the epic states
  that explicitly and stays open — partial epics do not close.

## Release-bundle evidence (every release)

A release is evidenced by:

| Element | Where |
|---|---|
| `release-validate.sh` PASS output | CI log / local run |
| Version + changelog entry | `version.txt`, `CHANGELOG.md` (auto via release workflow) |
| AARs for epics closed in the release | `000-docs/*RA-AAR-*` |
| Threat-model review outcome | note in the release PR or AAR |
| Known-gaps classification | per `035-OD-PROC-release-checklist` |

## Integrity note

The audit journal (`src/journal/`) is the runtime evidence substrate — a signed,
hash-chained record of every gated tool call, verifiable offline against the
published public key. This document governs *process* evidence (beads/epics/
releases); the journal governs *runtime* evidence. They are complementary: process
evidence proves the work was done to standard; the journal proves what the running
system actually did.

## Minimum, not maximum

This is the floor. More evidence (benchmarks, screenshots, threat re-analysis) is
always welcome on the bead or in the AAR. The point is that a reviewer six months
later can reconstruct what shipped, why it was safe, and what was knowingly deferred.
