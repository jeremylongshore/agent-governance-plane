# TESTING.md — agent-governance-plane

Testing policy + observational state. Policy sections (Classification, Thresholds,
Waived layers) are engineer-owned. Observational sections are refreshed by
`/audit-tests`.

## Classification

- Repo type: **cli + library hybrid** (`agp` CLI binary + governance-plane internals)
- Stack: Bun 1.2.23 + TypeScript (strict, `noEmit`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- Compliance overlay: none

## Thresholds (engineer-owned policy)

Keys use the audit-harness schema, non-bulleted so `escape-scan` can parse them
(it greps `^\s*coverage.line:` — a leading `-` list bullet would break the match).
`coverage.line` is also the live floor enforced by `scripts/coverage-gate.sh`
(which additionally gates functions at 88).

```text
coverage.line: 90
coverage.branch: 0
mutation.kill_rate: 0
```

- `coverage.line: 90` — aggregate line %; live-enforced by `scripts/coverage-gate.sh` (+ functions: 88).
- `coverage.branch: 0` — not gated (Bun reports function/line, not branch).
- `mutation.kill_rate: 0` — not gated (no mutation tool; deferred to backlog bead `agp-e3b`).

> Floors are the project AGGREGATE, not per-file: Bun's built-in per-file
> `coverageThreshold` trips on the deliberately gated real-environment paths
> (`AGP_DOCKER_E2E`, `AGP_CLAUDE_LIVE`) that cannot run in CI.

## Installed gates

- L0: **`@intentsolutions/audit-harness@v1.1.4`** — vendored at `.audit-harness/` (wrapper `scripts/audit-harness`, no npm dep). Provides `verify` (hash-pin) + `escape-scan`. Pinned policy surfaces declared in `.harness-hash-extra-patterns`; manifest at `.harness-hash`.
- L1: GitHub Actions CI — `code` (typecheck + tests + coverage gate), claim-scan, doc-drift, markdownlint, **harness (verify + escape-scan)** (hard); bead-validate (informational). **Pre-commit hook** (`scripts/pre-commit-gates.sh`, wired into `.beads/hooks/pre-commit` above bd's managed section; activate with `bd hooks install`) mirrors all hard gates locally **including harness verify + escape-scan --staged**.
- L2: strict `tsc --noEmit` + **Biome linter** (`biome.json`, `bun run lint`, recommended rules over `src/`; `noNonNullAssertion` + `useTemplate` off — see CLAUDE.md). Hard gate in CI + pre-commit. Formatter not enabled.
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
- Mutation testing: deferred (backlog bead `agp-e3b`); intentionally kept
  minimal per repo CLAUDE.md. (audit-harness vendoring: DONE — v1.1.4. Linter:
  DONE — Biome.)

## Last audit

- 2026-06-03 — `/audit-tests`. Grade B− (78/100). Coverage 93.2% lines / 91.2%
  funcs (aggregate). RTM: 22/22 MUST covered (0 uncovered → no P0). 2 P1s
  (`agp sessions` untested → fixed this pass; live-dogfood off-CI = agp-3g0).

## Traceability

- `tests/RTM.md` — 41 requirements; 22 MUST all covered; 5 WON'T-at-v0 excluded.
- `tests/PERSONAS.md` — operator persona 8/9 flows (live dogfood off-CI).
- `tests/JOURNEYS.md` — 7-step governed-session journey; step-4 live leg off-CI.
