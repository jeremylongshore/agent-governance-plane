# TESTING.md — agent-governance-plane

Testing policy + observational state. Policy sections (Classification, Thresholds,
Waived layers) are engineer-owned. Observational sections are refreshed by
`/audit-tests`.

## Classification

- Repo type: **cli + library hybrid** (`agp` CLI binary + governance-plane internals)
- Stack: Bun 1.2.23 + TypeScript (strict, `noEmit`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- Compliance overlay: none

## Thresholds (engineer-owned policy)

- coverage.lines: 90   (aggregate; enforced by `scripts/coverage-gate.sh`)
- coverage.functions: 88 (aggregate)
- mutation: not enforced (no mutation tool installed — see Waived/Deferred)

> Floors are the project AGGREGATE, not per-file: Bun's built-in per-file
> `coverageThreshold` trips on the deliberately gated real-environment paths
> (`AGP_DOCKER_E2E`, `AGP_CLAUDE_LIVE`) that cannot run in CI.

## Installed gates

- L1: GitHub Actions CI — `code` (typecheck + tests + coverage gate), claim-scan, doc-drift, markdownlint (hard); bead-validate (informational). No pre-commit hooks; no audit-harness.
- L2: strict `tsc --noEmit`. No linter/formatter.
- L3: `bun test` (88 tests, 16 files) + aggregate coverage gate (`scripts/coverage-gate.sh`).
- L4: contract schema tests + gated real-Docker E2E (`AGP_DOCKER_E2E`).
- L5 (security): replay/bot-reject, journal tamper+truncation detection, default-deny, fail-closed `require`, gate-only mediation.

## Frameworks

- Test runner: `bun test`
- Coverage: `bun test --coverage` (gated by `scripts/coverage-gate.sh`)

## Waived / deferred layers

- L5 a11y: waived (no UI).
- L6 BDD/Gherkin + L7 UAT: deferred — the "Jeremy in his truck" operator persona
  is the de-facto UAT; the live dogfood is bead `agp-3g0` (off-CI).
- Mutation testing, linter, audit-harness vendoring: deferred (backlog bead);
  intentionally kept minimal per repo CLAUDE.md.

## Last audit

- 2026-06-03 — `/audit-tests`. Grade B− (78/100). Coverage 93.2% lines / 91.2%
  funcs (aggregate). RTM: 22/22 MUST covered (0 uncovered → no P0). 2 P1s
  (`agp sessions` untested → fixed this pass; live-dogfood off-CI = agp-3g0).

## Traceability

- `tests/RTM.md` — 41 requirements; 22 MUST all covered; 5 WON'T-at-v0 excluded.
- `tests/PERSONAS.md` — operator persona 8/9 flows (live dogfood off-CI).
- `tests/JOURNEYS.md` — 7-step governed-session journey; step-4 live leg off-CI.
