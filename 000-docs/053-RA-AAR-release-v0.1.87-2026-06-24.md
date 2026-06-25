# Release Report (AAR): agent-governance-plane v0.1.87

## Executive summary

- **Version:** v0.1.87
- **Release date:** 2026-06-24 (GitHub release cut 23:09 UTC)
- **Release type:** patch (automated)
- **Mechanism:** `.github/workflows/release.yml` — conventional-commit-driven
  bump → `version.txt` + `CHANGELOG.md` + tag + GitHub release. **No manual
  release ceremony was run** (and none should be — hand-editing `version.txt` or
  the CHANGELOG release sections is prohibited by `CLAUDE.md`). This AAR is the
  documentation output of a `/release` audit that deliberately stopped before the
  conflicting execute phase.
- **What shipped:** the authority-model decision — PR #116 reserved the
  `on_behalf_of` principal field in `JournalEvent` and recorded the thinker-canon
  board verdict.

## What v0.1.87 contains

Single substantive change — **PR #116** (`feat(journal): reserve on_behalf_of
principal field + record thinker-canon board verdict`, squash `4d97c21`):

- `on_behalf_of` added to `JournalEvent.ReservedFutureFields` (nullable, `null`
  at v0) + `RESERVED_FIELD_NAMES` — the additive, CISO-locked reserved-field
  pattern; not a breaking change.
- Hickey's guardrail encoded in three places (field doc, `013-AT-CONT`,
  `052-AR-BORD`): the field is **accountability data only — never read to
  authorize**.
- `journal.append()` fix: `on_behalf_of: null` included in the hashed bytes so
  write↔verify canonicalize identically (a real chain-integrity bug surfaced and
  caught by the journal-verification tests).
- `000-docs/052-AR-BORD` records the board verdict (4-point ruling, the reframing
  discovery, the CCSC `supervisor.ts:328-329` latent cross-user-attribution bug,
  and preserved dissents).

## Provenance

The change is the converged, near-unanimous action from the **thinker-canon board
review** (14 reviewers) of AGP's multi-tenant authority model — itself triggered
by Kenton Varda's capability-security critique of Anthropic's "Agent Identity and
Access Model." The board decided the *position* (human-derived authority) and
acted only on the one **irreversible** item (the signed journal cannot be
retrofitted). Decision bead: `agp-dxp` (open); shipped sub-task: `agp-dxp.1`
(closed). Full brief: issue #115.

## Metrics

| Metric | Value |
|--------|-------|
| PRs in release | 1 (#116) |
| Files changed | 7 |
| Lines added / removed | +162 / −13 |
| Tests | 306 pass / 0 fail |
| Coverage | functions 91.24% (floor 88%), lines 94.10% (floor 90%) |

## Quality gates (all green)

| Gate | Status |
|------|--------|
| `tsc --noEmit` typecheck | ✓ |
| Biome lint | ✓ |
| `bun test` + coverage floor | ✓ |
| claim-scan (banned-claim hygiene) | ✓ |
| audit-harness verify + escape-scan | ✓ (REFUSE=0 CHALLENGE=0 FLAG=0) |
| markdownlint · doc-drift | ✓ |
| Governed-loop dogfood | ✓ |
| Greptile advisory review | ✓ 5/5, zero findings |

## Repository state at release

- `version.txt` = `package.json` = latest tag = `v0.1.87` (consistent).
- Working tree clean; `main` up to date; 0 open PRs; 0 beads in-progress.
- All 8 governance scaffolding files present; no secrets in tracked source.

## Open follow-ups (deferred, tracked)

- **`agp-dxp`** (open) — the authority-model *mechanism* (capability vs
  policy-gate), per-principal credential scoping, and the `speaker == owner`
  enforcement (+ the CCSC `supervisor.ts:328` precondition) stay deferred to the
  hosted multi-tenant build. A formal `/exec-decision-council` ratification is the
  trigger when real multi-tenant pull arrives.
- **Topology C** `agp-3s4.3` / `.4` (deferred) — egress-allowlist proxy +
  internal-network enforcement + live preflight gate (real-infra validation).
- **`agp-g1h`** (open) — refresh the stale public AGP one-pager/operator-audit
  gist (last reviewed 2026-06-07).

## Rollback procedure

Releases are automated and additive; a rollback would be a forward fix (a new
`fix:` commit the pipeline releases), not a tag deletion. If a tag must be pulled:

```bash
git push origin --delete v0.1.87
git tag -d v0.1.87
gh release delete v0.1.87 --yes --repo jeremylongshore/agent-governance-plane
```

## Lessons

- The `/release` full ceremony is **not** the right tool for this repo — releases
  are automated. The audit phases (consistency, security, doc-currency) remain
  useful; the execute phase conflicts and must be skipped. Recorded here so a
  future session doesn't run the manual ceremony against the automation.
- A deliberate non-patch bump (e.g. a `0.2.0` milestone) is done via
  `release.yml`'s `workflow_dispatch` bump-type input — never by hand-editing.
