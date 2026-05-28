---
title: AGP Structural Audit — 16-Epic Phase B Setup
date: 2026-05-27
auditor: architect-reviewer subagent (Claude Code, automated)
scope: Verify AGP repo + bead + GH issue structure against the locked Phase B 16-epic plan
verdict: PASS-WITH-NOTES
---

# AGP Structural Audit — 16-Epic Phase B Setup

## Verdict: PASS-WITH-NOTES

Structural skeleton is sound. All 16 parent epic beads exist (`agp-5l8` Epic 00 through `agp-upt` Epic 15), all 16 mirrored GH issues (#3–#18) are in place with matching titles and labels, Epic 00 has its full 10-child set (`agp-5l8.1`–`agp-5l8.10`) mirrored to GH issues #19–#28, foundation docs are present and substantial (337 / 523 / 811 / 76 LoC), repo surface (README / AGENTS / CLAUDE) is clean of both `products-workspace` path drift and banned-claim language, and cross-references between beads and GH issues are wired correctly with `bd-sync` mirror discipline.

The known-and-expected residual drift — `products-workspace` references inside the four foundation docs — is exactly the work Epic 00 children C2, C9, and (indirectly) the version-ladder fixes are designed to remediate. Its presence is the *symptom* of pre-cleanup state, not a failure of the structural setup. No discrepancies relative to the locked controlling decisions.

## Per-dimension findings

| # | Dimension | Status | Evidence |
|---|---|---|---|
| 1 | All 16 parent epic beads filed | ✓ | `bd list --type=epic` → 16 epics, prefix `agp`, plain-English titles |
| 2 | 16 mirrored GH issues #3-#18 with `epic` label | ✓ | `gh issue list --label epic` → #3 Epic 00 … #18 Epic 15, all open, all labeled `epic + agp-phase-b + epic-NN` |
| 3a | Bead notes → GH issue cross-ref | ✓ | `agp-5l8`→#3, `agp-7j5`→#4, `agp-yvo`→#10, `agp-upt`→#18 all present in bead NOTES with full URL |
| 3b | GH issue body → Bead ID cross-ref | ✓ | Issues #3 / #10 / #18 each open with `**Bead:** \`agp-NNN\`` on line 1 |
| 4 | Body completeness (all required sections) | ✓ | Issues #3, #10, #18 spot-checked — every required section present (Bead, Epic, Why, Scope, Out of scope, Internal docs, Acceptance criteria, Validation, Closure evidence required, Notes) plus mirror-rule footer and signature |
| 5a | 10 Epic 00 child beads filed | ✓ | `bd list` → `agp-5l8.1` through `agp-5l8.10`, all open, plain-English titles, P1/P2 mix matching plan |
| 5b | 10 child GH issues #19-#28 with correct labels | ✓ | `gh issue list --label epic-00` → 11 (parent #3 + 10 children); children carry `agp-phase-b + epic-00 + (contradiction-fix or aar)` |
| 5c | Each child issue body has bead ID + parent ref | ✓ | #19 (`agp-5l8.1`) and #28 (`agp-5l8.10`) both link to parent `#3` and quote the child bead ID; "How to claim" block included for OSS-friendly contribution |
| 6 | No `products-workspace` refs in repo surface | ✓ in README/AGENTS/CLAUDE; ⚠ in 000-docs | README/AGENTS/CLAUDE clean. 15 hits in `000-docs/001-003` — this is the known C9/C4 drift Epic 00 is filed to fix. Not a structural failure. |
| 7 | Foundation docs present and non-empty | ✓ | `001-AT-DECR` 337 LoC, `002-PP-PLAN` 523 LoC, `003-AA-AUDT` 811 LoC, `004-AR-CANN` 76 LoC |
| 8 | Banned-claim language in README/AGENTS/CLAUDE | ✓ | grep returned exit 1 (zero hits). Repo surface is clean. (Foundation docs may still contain such language — Epic 11 will scan and enforce.) |
| 9 | Labels applied correctly | ✓ | All 16 parent issues: `epic + agp-phase-b + epic-NN`. All 10 Epic 00 children: `agp-phase-b + epic-00 + (contradiction-fix \| aar)`. Schema is flat and consistent. |

## Top 3 risks

1. **Foundation docs still carry the drift Epic 00 is filed to fix.** Validation grep blocks inside the bead/issue bodies show `products-workspace` hits as the *expected pre-state* — but until Epic 00 closes, anyone reading the 000-docs will see the old paths. Sequencing matters: Epic 00 must land before any external reviewer is pointed at the foundation docs as a single source of truth, otherwise the "monorepo at agent-governance-plane" decision looks contradicted by the documents that announce it.
2. **No banned-claim scanner was enforced at CI yet** — Epic 11 is the home for `MARKETING_CLAIMS.md` + docs linting. The repo surface was clean today by careful authoring, not by automation; a future contributor PR could regress that without a CI gate. **Remediated by the CTO cleanup PR that committed this report: `scripts/claim-scan.sh` is now enforced in CI.** Until full Epic 11 lands (including the version-gated registry), the scanner enforces the v0 baseline.
3. **Epic 00 is the only epic with children filed**, and several other epics (notably 02 substrate extraction, 07 Docker sandbox, 10 audit journal) carry significant security boundary surface area. Children for those will need the same rigor of bead-per-decision filing — there is no template artifact in the repo yet to guarantee Epic 01-15 children land with the same body completeness as Epic 00 children. Epic 15's AAR template + PR template work mitigates this once it lands. **Partially remediated by the CTO cleanup PR: tightened `.github/PULL_REQUEST_TEMPLATE.md` enforces Bead ID + GH issue + docs + validation on every PR going forward.**

## What's missing relative to spec

The structural Phase B setup is complete to the documented scope. What remains is:

- Execute Epic 00 — fix C1-C10 in the foundation docs, write the planning-cleanup AAR at `000-docs/0NN-OD-AAR-...`, close each child with PR + commit + grep-validation evidence.
- Once Epic 00 closes, file children for Epics 01-15 (none exist yet — only parents).
- Wire the CI gates Epic 11 + Epic 15 promise: full banned-claim version-gated registry, release-validate script, AAR template enforcement.
- Begin substrate extraction (Epic 02) only after Epic 00 closes, since the substrate-extraction ADR is itself one of Epic 00's contradictions to resolve (C8 → `agp-5l8.9`).

The work ahead is execution against a well-scaffolded plan, not re-scaffolding.

## Audit method

This audit was produced by the architect-reviewer subagent during the 2026-05-27 setup session. Method:

- `bd list --type=epic` → confirm 16 parents
- `gh issue list --label epic --limit 30` → confirm 16 mirrored issues
- `bd-sync status <bead>` × spot-checks → confirm cross-ref integrity
- `bd list --parent agp-5l8` → confirm 10 Epic 00 children
- `gh issue list --label epic-00 --limit 30` → confirm 10 child issues
- `grep -RE 'products-workspace|~/000-projects/products' 000-docs/ README.md CLAUDE.md AGENTS.md` → drift inventory
- `grep -nE 'tamper.?evident|tamper.?proof|nonrepudiat|forensic|audit.?grade|compliance.?grade' README.md AGENTS.md CLAUDE.md` → public-surface banned-claim check
- Spot-read GH issue bodies for #3 / #10 / #18 / #19 / #28 → completeness

Read-only audit. No files modified.

- Jeremy Longshore
intentsolutions.io
