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
- `mutation.kill_rate: 0` — not gated; blocked on toolchain. Stryker v9 cannot instrument this Bun/TS codebase (`TypeError: generator is not a function`). `stryker.config.json` + `scripts/mutation-gate.sh` are retained as scaffolding (scope: `src/policy/engine.ts` + `src/policy/dangerous.ts`); no CI job until a Bun-compatible mutation runner exists. Tracked in `agp-7r4`.

> Floors are the project AGGREGATE, not per-file: Bun's built-in per-file
> `coverageThreshold` trips on the deliberately gated real-environment paths
> (`AGP_DOCKER_E2E`, `AGP_CLAUDE_LIVE`) that cannot run in CI.

## Installed gates

- L0: **`@intentsolutions/audit-harness@v1.1.4`** — vendored at `.audit-harness/` (wrapper `scripts/audit-harness`, no npm dep). Provides `verify` (hash-pin) + `escape-scan`. Pinned policy surfaces declared in `.harness-hash-extra-patterns`; manifest at `.harness-hash`.
- L1: GitHub Actions CI — `code` (typecheck + tests + coverage gate), claim-scan, doc-drift, markdownlint, **harness (verify + escape-scan)** (hard); bead-validate (informational). **Pre-commit hook** (`scripts/pre-commit-gates.sh`, wired into `.beads/hooks/pre-commit` above bd's managed section; activate with `bd hooks install`) mirrors all hard gates locally **including harness verify + escape-scan --staged**.
- L2: strict `tsc --noEmit` + **Biome linter** (`biome.json`, `bun run lint`, recommended rules over `src/`; `noNonNullAssertion` + `useTemplate` off — see CLAUDE.md). Hard gate in CI + pre-commit. Formatter not enabled.
- L3: `bun test` (150 tests, 24 files) + aggregate coverage gate (`scripts/coverage-gate.sh`).
- L4: contract schema tests + gated real-Docker E2E (`AGP_DOCKER_E2E`).
- L5 (security): replay/bot-reject, journal tamper+truncation detection, default-deny, fail-closed `require`, gate-only mediation.

## Frameworks

- Test runner: `bun test`
- Coverage: `bun test --coverage` (gated by `scripts/coverage-gate.sh`)

## Waived / deferred layers

- L5 a11y: waived (no UI).
- L6 BDD/Gherkin: `tests/features/J1-governed-session.feature` (6 scenarios mapped
  to INV-1 through INV-6); executed by `tests/features/J1-governed-session.steps.test.ts`
  (5 real tests + 1 `.skip` gated behind `AGP_CLAUDE_LIVE`). Gherkin-lint is advisory
  in CI (`continue-on-error: true`). L7 UAT: the "Jeremy in his truck" operator persona
  is the de-facto UAT; the live dogfood is bead `agp-3g0` (off-CI).
- Mutation testing: blocked on toolchain (`agp-7r4`). Stryker v9 errors instrumenting
  this Bun/TS codebase; `stryker.config.json` + `scripts/mutation-gate.sh` are retained
  as scaffolding (scope: `src/policy/engine.ts` + `src/policy/dangerous.ts`) but NOT
  CI-wired — no permanently-red or fake-green gate. Re-add the CI job + set a baseline
  when a Bun-compatible mutation runner exists. (audit-harness vendoring: DONE — v1.3.0.
  Linter: DONE — Biome.)

## Last audit

- 2026-07-12 — **extraction (not an audit):** the Slice-0 GitHub watcher agent +
  `agp watch` CLI + template test packs were extracted to
  `jeremylongshore/bob-the-intendant` (`000-docs/059-AT-ADR`; intent-eval-lab
  `109-AT-DECR`). RTM REQ-043/045/046/047/048/049 moved to Bob; AGP retains the
  kernel primitives (REQ-042 mediated-run, REQ-044 cross-chain pointer, REQ-050
  trigger-source contract). AGP kept green throughout (typecheck, tests,
  coverage-gate, claim-scan, harness verify + escape-scan). No `/audit-tests`
  re-run in this pass; the journey/persona counts below are updated for the
  removed watcher rows.
- 2026-07-10 — `/audit-tests` (post-Slice-0, branch `feat/slice-0-github-watcher`,
  PR #123). **Grade A− (90/100)**, up from B−. Coverage 94.39% lines / 91.81%
  funcs vs floors 90/88. RTM: 28/28 MUST covered (REQ-042…047 added). New
  journey J2 (trigger-woken governed agent) 7/7 ✓; operator persona 9/10 flows.
  Zero P0/P1 → **no implement-tests handoff**. Advisories: vendored harness
  v1.3.0 (bumped from v1.1.5 — `agp-dc1`, 2026-07-14); mutation still blocked
  (`agp-7r4`); live dogfood legs off-CI by design (`agp-3g0`, `agp-eva.1.5`);
  eval layer = Slice 2 per intent-os `030-AT-DECR`.
- 2026-06-03 — `/audit-tests`. Grade B− (78/100). Coverage 93.2% lines / 91.2%
  funcs (aggregate). RTM: 22/22 MUST covered (0 uncovered → no P0). 2 P1s
  (`agp sessions` untested → fixed this pass; live-dogfood off-CI = agp-3g0).

## Traceability

- `tests/RTM.md` — 44 requirements; 25 MUST all covered; 5 WON'T-at-v0 excluded. (Down from 47/28 after the 2026-07-12 watcher extraction: REQ-043/045/046/047/048/049 moved to `bob-the-intendant`; REQ-050 added for the retained trigger-source contract.)
- `tests/PERSONAS.md` — operator persona 8/9 flows (live dogfood off-CI).
- `tests/JOURNEYS.md` — 7-step governed-session journey; step-4 live leg off-CI.

## Agent-template test packs (extracted to bob-the-intendant)

The per-agent template test packs — every agent template shipping its OWN pack
under `templates/<name>/tests/` (unit + **policy** + **state/memory** +
acceptance) — were **extracted** to the composing product repo
`jeremylongshore/bob-the-intendant` (2026-07-12, `000-docs/059-AT-ADR`;
intent-eval-lab `109-AT-DECR`), together with the GitHub watcher agent and its
`agp watch` operator surface. AGP now keeps only the kernel primitives those
packs compose: the `trigger-source` contract, the daemon's `runMediated()`
mediated-run loop, and the journal's cross-chain causal-pointer primitive
(RTM REQ-042, REQ-044, REQ-050). Bob's repo runs the template packs under its
own `bun test`; the `Prompt → Spec → Tests → Policy → Deploy` deploy rule and
the JRig evaluation layer live there.
