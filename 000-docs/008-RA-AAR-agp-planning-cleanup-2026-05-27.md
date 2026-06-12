---
title: AGP Epic 00 Planning-Cleanup After-Action Report
date: 2026-05-27
author: Jeremy Longshore
type: After-Action Report (AAR)
epic: Epic 00 — Canonicalize the AGP planning package before implementation begins (bead agp-5l8, GH #3)
scope: Closure record for all C1–C10 foundation-doc contradictions — what was fixed, what was deferred, and why
verdict: 10 contradictions resolved or accepted as scoped gaps; planning package canonical; doc-drift promoted to a hard CI gate
---

# AGP Epic 00 Planning-Cleanup After-Action Report

## Executive summary

Epic 00 existed to canonicalize the AGP planning package (`000-docs/001-AT-DECR`,
`002-PP-PLAN`, `003-AA-AUDT`) **before** any implementation began, so that the
16-epic Phase B build would not inherit a crooked foundation. A line-level audit
([`007-OD-AUDT`](007-OD-AUDT-foundation-doc-contradictions-2026-05-27.md)) mapped
~75 contradiction sites grouped into ten findings (C1–C10): demo-first framing,
analyst-relations timing as a build driver, a self-conflicting version ladder,
stale substrate metrics, wrong auth assumptions, a wrong direct-import assumption,
pre-monorepo paths, and over-strong decision-authority/claim language.

Eight of the ten were fixed in place across PRs #29–#33 and this closeout PR.
Two (C5, C6) are **accepted scoped gaps** routed to their correct owners (CCSC
upstream and Epic 11 claim-control) rather than force-fixed inside Epic 00.

This AAR is also the trigger to promote the **doc-drift check from informational
to a hard CI gate** — the audit docs that legitimately quote the old paths are
exempted, and `continue-on-error` is removed from the `doc-drift` job.

This document is the format template that the release-discipline epic
(`agp-upt`) inherits for future closeout AARs.

## Context

- **Why Epic 00 came first.** Phase A produced strong docs but with drift: the
  council record and master blueprint still carried a superseded "demo-first /
  Forrester-deadline" framing, a version ladder whose `v0.2` meant different
  things in different places, and substrate assumptions that did not match the
  real CCSC repo. Starting implementation on top of that would have hard-coded
  the contradictions into code.
- **Method.** A subagent audit produced `007-OD-AUDT`, a line-level inventory of
  every contradiction site with a recommended fix order. Each finding became a
  child bead with its own GitHub issue; fixes landed as small, reviewed PRs with
  per-finding verification greps (preserved as `scripts/bead-validate.sh`).
- **Discipline.** Foundation docs were edited in place; the historical
  adversarial-input record (`004-AR-CANN`) and the audit docs (`005`–`007`) were
  treated as read-only history.

## Contradictions resolved (C1, C2, C3, C4, C7, C8, C9, C10)

| C# | Contradiction | Bead | GH issue | PR | Commit | Resolution |
|----|---------------|------|----------|----|--------|------------|
| C1 | Forrester April-2026 timing cited as a build driver | `agp-5l8.2` | #20 | #32 | `a69cb74` | Reframed: analyst-relations deadlines are explicitly **not** build drivers; original cadence preserved only as superseded historical record. |
| C2 | "Hosted demo" framed as the v0.2 goal | `agp-5l8.1` | #19 | #32 | `a69cb74` | Demo-first framing rejected; v0.2 is at most an optional internal-readiness milestone; no public surface until core primitives are defensible. |
| C3 | Version ladder where `v0.x` meant different things in different docs | `agp-5l8.3` | #21 | #33 | `c2704ac` | Single normalized version-ladder table is now the surviving roadmap; older narratives marked historical. |
| C4 | Stale CCSC LoC figures (~12k/~13k) | `agp-5l8.7` | #25 | #33 | `c2704ac` | Refreshed against live `wc -l` of the CCSC substrate. |
| C7 | Docs assumed AGP holds an Anthropic API key | `agp-5l8.8` | #26 | #29 | `154a000` | Corrected: the Claude intendant reuses the operator's Claude Code login session (CCSC posture); AGP holds no Anthropic API key at v0. |
| C8 | Docs assumed CCSC consumed via "direct import / monorepo refs" | `agp-5l8.9` | #27 | this PR | (closeout) | Direct-import assumption replaced with an explicit deferral: the substrate-extraction mechanism is TBD by the Epic 02 ADR (`agp-7ii`); forward-referenced in `002` and `003`. |
| C9 | Pre-monorepo workspace paths in the planning set | `agp-5l8.4` | #22 | #30 | `1400892` | All planning-doc paths normalized to the canonical repo path; old paths survive only as audit inventory in `007` (see that doc for the line-level list). |
| C10a | Decision-authority language implied Claude ratified decisions | `agp-5l8.5` | #23 | #31 | `5a8f61f` | Clarified: Jeremy owns decisions; Claude Code executes through Beads. |
| C10b | ISEDC framed as an external legal/security authority | `agp-5l8.6` | #24 | #31 | `5a8f61f` | Clarified: ISEDC is an internal adversarial decision process, not an external authority. |

Note on the per-finding verification greps in `scripts/bead-validate.sh`: C1, C2,
and C7 still surface as "FAIL" there, but those are **false positives** — the
banned phrases now appear only inside supersession/negation context (e.g. "Phase
B controlling change rejects this", "AGP does **NOT** hold an Anthropic API key").
The grep is deliberately heuristic, which is exactly why the `bead-validation`
CI job is informational forever rather than a gate.

## Accepted scoped gaps (C5, C6) — deferred, not dropped

| C# | Finding | Why it is not an Epic 00 fix | Owner |
|----|---------|------------------------------|-------|
| C5 | CCSC `server.ts` LoC drift | A CCSC-side number, co-located with C4 in passing. Not a contradiction in the AGP planning package; fixing it inside AGP docs would just re-introduce a number that drifts again. | CCSC upstream (`claude-code-slack-channel`) |
| C6 | CCSC/operator-audit narrative uses v0-banned assurance claims | Claim control is an entire epic with its own enforcement (`MARKETING_CLAIMS.md` + a docs-linting gate). Force-rewording narrative prose in Epic 00 would pre-empt that design. `007` inventories ~20 hits for the fix team and distinguishes genuine narrative violations (e.g. `003`:474–477, to be reframed) from the registry definition itself (`002`:200/289/302, which legitimately enumerates the banned terms). | Epic 11 — AGP claim-control enforcement (`agp-6mq`) |

Both gaps are tracked by their owning epics, so closing Epic 00 does not lose them.

## CI consequence: doc-drift promoted to a hard gate

Per the standing note in `.github/workflows/ci.yml`, the close of this AAR flips
the `doc-drift` job from informational to enforcing:

- `scripts/doc-drift.sh` now exempts
  `000-docs/007-OD-AUDT-foundation-doc-contradictions-2026-05-27.md` — that doc
  is the audit *inventory* of the old paths (it documents the drift it found),
  the same reason the detection scripts themselves are exempted.
- `continue-on-error: true` is removed from the `doc-drift` job, so any future
  reintroduction of a pre-monorepo path or a pre-renumbering foundation-doc ID
  fails the build.

The `bead-validation` job stays informational (its greps are bead-acceptance
heuristics, not gates).

## Verification

```text
# C8 contradiction cleared (no bare direct-import / monorepo-refs assumption):
$ grep -nE 'direct import|monorepo refs' 000-docs/00[23]*.md
003:250  (the reuse-table cell that explicitly defers to the Epic 02 ADR — allowed)

# C9 path drift stays clean (gate, not informational):
$ bash scripts/doc-drift.sh ; echo exit=$?
[doc-drift] PASS: no path or numbering drift detected.
exit=0

# AAR exists at the canonical path:
$ ls 000-docs/008-RA-AAR-agp-planning-cleanup-2026-05-27.md

# All Epic 00 children closed:
$ bd children agp-5l8   # .1–.9 + .10 closed; .11 was a throwaway test bead
```

## What went well

- **Audit-first paid off.** The line-level `007` map made the fixes mechanical
  and reviewable; nobody had to re-derive "where is the drift" per PR.
- **Small PRs per finding.** One contradiction (or tightly-related pair) per PR
  with a verification grep kept review cheap and the audit trail legible.
- **Deferring beats force-fixing.** C5 and C6 were routed to their real owners
  instead of being papered over inside Epic 00, which would have created new
  drift.

## What we would do differently

- **Heuristic greps lie both ways.** `bead-validate.sh` produces persistent false
  positives once the rejected phrasing is quoted in negation context. Future
  acceptance greps should match on *uncontextualized* occurrences (e.g. exclude
  lines containing "reject/superseded/NOT") or assert on a structured marker
  rather than raw phrase presence.
- **Filename drift is real even in a 7-doc set.** This AAR was specced as
  `005-RA-AAR-...` but `005`–`007` were taken by audit docs created after the
  bead was filed; it shipped as `008-RA-AAR-...`. Allocate the document number at
  authoring time, not at planning time.

## Remaining gaps / forward work

- **C6 narrative reframe** — Epic 11 (`agp-6mq`) must reframe the genuine
  banned-claim uses in the `003` operator-audit narrative while preserving the
  registry definition that legitimately enumerates the terms.
- **Substrate-extraction ADR** — Epic 02 (`agp-7ii`) owns the actual
  vendor/submodule/path-dep/shared-package decision that C8 deferred.
- **C5 LoC drift** — a CCSC-upstream housekeeping item, not AGP's.

## Forward template

This AAR is the closeout format the release-discipline epic (`agp-upt`) inherits:
front-matter verdict line, a resolved-items table keyed by finding →
bead → GH issue → PR → commit → resolution, an explicit accepted-gaps table with
owners, a verification block with real command output, and what-went-well /
what-we'd-do-differently sections. Reuse this skeleton for per-epic and
per-release AARs.
