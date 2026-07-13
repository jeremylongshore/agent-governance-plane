# TEST_AUDIT.md — agent-governance-plane (AGP)

> **Extraction note (2026-07-12, `000-docs/059-AT-ADR`; intent-eval-lab `109-AT-DECR`):**
> the Slice-0 GitHub **watcher agent** + `agp watch` CLI + `templates/github-watcher/`
> test packs were extracted to the composing product repo
> `jeremylongshore/bob-the-intendant`. The audit below reflects the pre-extraction
> Slice-0 state; the watcher-specific rows (template packs, journey J2, the
> `run-governed-watch` persona flow, RTM REQ-043/045/046/047/048/049) now live in
> Bob's repo. AGP retains the kernel primitives (RTM REQ-042 mediated-run, REQ-044
> cross-chain pointer, REQ-050 trigger-source contract). Re-run `/audit-tests` to
> regenerate a post-extraction grade.
>
> Diagnostic produced by `/audit-tests` (7-layer + RTM/personas/journeys).
> Date: 2026-07-10 · Branch: `feat/slice-0-github-watcher` (PR #123) · Version: v0.1.93+slice0
> Purpose of this pass: validate that Slice 0's "tests/eval baked into the build" deliverable (epic `agp-eva.1`) actually holds.

## Grade: A− (90/100)

Up from B− (78/100, 2026-06-03). What moved it: the **per-template test-pack
artifact is real and CI-run** (policy/state/acceptance custom layers), RTM grew
to **28 MUST all covered** (Slice-0 REQ-042…047), a new critical journey (J2)
is 7/7 ✓ at L3/L4, coverage sits above floors, arch/bias/escape all zero. What
holds it below A: mutation testing still toolchain-blocked, vendored-harness
version drift, and the evaluation (judgment-quality) layer deferred to Slice 2
by decision record — recorded, not silent.

## Freshness

⚠ **audit-harness drift: vendored v1.1.5 → latest 1.3.0.** Newer verbs this
skill references (`classify`, `conform`, `audit`, `scan`, `currency`) do not
exist in v1.1.5; classification fell back to the engineer-pinned
`tests/TESTING.md#Classification` (policy wins anyway). Action:
`/sync-testing-harness` (re-vendor with `AUDIT_HARNESS_VERSION=v1.3.0`, note
the unpack-glob fix in CLAUDE.md), then `scripts/audit-harness init`. Doc nit:
CLAUDE.md says v1.1.4; `.audit-harness` reports v1.1.5.

## Classification (engineer-pinned; policy wins)

**cli + library hybrid** — `agp` CLI + governance-plane internals. Bun 1.2.x +
strict TS. No compliance overlay. Applicable: L1, L2, L3, L4 (contract + gated
real-infra), L5-security, L6 (feature + steps), L7 (RTM/acceptance). Waived:
L5-a11y (no UI); mutation (toolchain, recorded — bead `agp-7r4`).

## Per-layer presence / enforcement

| Layer | Present | Enforced | Evidence |
|---|---|---|---|
| L1 hooks + CI | ✓ | HARD | `scripts/pre-commit-gates.sh` via `.beads/hooks/pre-commit`; 7 CI checks green on PR #123 |
| L2 static | ✓ | HARD | strict `tsc --noEmit` + Biome (0 findings) + claim-scan + markdownlint |
| L3 unit + walls | ✓ | HARD | 398 tests / 0 fail; coverage 94.39% lines / 91.81% funcs (floors 90/88); CRAP pass; arch 0 violations; bias 0 |
| L4 integration/contract | ✓ | HARD (CI) + gated (real infra) | contract schema tests; `AGP_DOCKER_E2E` gated leg |
| L5 security | ✓ | HARD | replay/bot-spoof, tamper/truncation, default-deny, fail-closed require, secret-screen |
| L6 E2E/BDD | ✓ partial-by-design | advisory | `tests/features/J1` + steps (live leg gated); vendored gherkin-lint hardcodes `features/` so it can't see `tests/features/` — the CI job covers it |
| L7 acceptance | ✓ | HARD (new) | template acceptance packs run in CI; RTM below |
| **Custom: policy** | ✓ NEW | HARD | `templates/github-watcher/tests/policy.test.ts` — require can't be weakened by a stray allow; default-deny |
| **Custom: state/memory** | ✓ NEW | HARD | `state.test.ts` + `state-log.test.ts` — same-SHA-twice silence; tamper-evident chain |
| **Custom: evaluation** | ✗ deferred | — | JRig judgment-quality pack = Slice 2 (IEP epic), per intent-os `030-AT-DECR` D5 — decision-recorded, not omitted |

## Gate results (this run)

- `scripts/audit-harness verify` → OK (exit 0)
- `escape-scan --staged` → REFUSE=0 CHALLENGE=0 FLAG=0
- `coverage-gate.sh` → PASS (94.39 / 91.81 vs floors 90 / 88)
- `crap` → pass (`reports/crap/summary.json`)
- `arch` → dependency-cruiser: 0 violations (incl. the new `triggers/` layer edges)
- `bias` → 0 patterns
- mutation → **blocked** (Stryker×Bun, bead `agp-7r4`) — recorded waiver, not silently skipped

## Gaps

- **P0: none.**
- **P1: none open in-repo** — the advisories below are recorded waivers,
  decision-gated deferrals, or tooling maintenance, not test gaps. **No
  `implement-tests` handoff fires.**
- Advisories:
  1. Harness drift v1.1.5 → 1.3.0 → run `/sync-testing-harness`.
  2. Mutation blocked (`agp-7r4`) — unchanged.
  3. Live legs off-CI by design: J1 step-4-live (`agp-3g0`); J2 live dogfood (`agp-eva.1.5` close criterion — the Slice-0 standing gate).
  4. Evaluation layer deferred to Slice 2 (IEP epic) by `030-AT-DECR` D5.
  5. Doc nit: CLAUDE.md harness version string (v1.1.4 vs actual v1.1.5).

## RTM summary

47 requirements: **28 MUST — all covered** (incl. Slice-0 REQ-042…047) ·
11 SHOULD covered · 3 COULD covered · 5 WON'T (v0) excluded. No orphaned
tests — every new Slice-0 test file is mapped in the RTM's Slice-0 map.

## Personas / journeys

- Operator persona: **9/10 flows covered (90%)** — new `run-governed-watch` ✓;
  only `live-dogfood-e2e` uncovered (off-CI by design, `agp-3g0`).
- **J1** (governed session): all MUST steps ✓ (unchanged from prior audit).
- **J2** (a trigger wakes a governed background agent — NEW): 7/7 steps ✓ at
  L3/L4 in CI; the live Docker+Slack leg is the Slice-0 standing-gate dogfood.

## Escape-scan

Clean (REFUSE=0 CHALLENGE=0 FLAG=0 on the staged diff).

## Handoff

**None.** No P0/P1 test gaps — Slice 0's test/eval deliverable holds as built.
Maintenance actions outside implement-tests scope: `/sync-testing-harness`
(harness bump), the two off-CI dogfood beads.
