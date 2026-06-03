# TEST_AUDIT.md — agent-governance-plane

> Diagnostic produced by `/audit-tests` (deep pass: 7-layer + RTM/personas/journeys).
> Date: 2026-06-03 · Branch: `main` · Version: v0.1.34

## Grade: B− (78/100)

Strong, well-asserted L3 content (93% lines, **22/22 MUST requirements covered**,
no tautologies, no assertion-free tests) with a coverage gate now enforcing the
floor. Held back from A-range by the missing IS-SOP enforcement layers (no
harness, mutation, linter, BDD/UAT). Up from C+ (74) on the prior shallow pass —
the coverage gate landed and this pass added full traceability.

## Classification

| Field | Value |
|---|---|
| Repo type | **cli + library hybrid** (`agp` CLI + governance-plane internals) |
| Stack | Bun 1.2.23 + TypeScript (strict) |
| Tests | 17 files, **92 tests** (was 88 — +4 `sessions` tests this pass), 1 skip (gated Docker E2E) |
| Coverage (aggregate) | **93.2% lines / 91.2% funcs**, gated by `scripts/coverage-gate.sh` (floor 90/88) |
| audit-harness | not installed (npm latest 0.1.0) |

## 7-layer map

| Layer | Status | Evidence / gap |
|---|---|---|
| **L1** Hooks & CI | 🟢 in place | CI jobs (code+coverage gate, claim-scan, doc-drift, markdownlint, **harness verify+escape-scan** hard; bead-validate informational) **+ pre-commit hook** mirroring all gates locally. **Vendored `@intentsolutions/audit-harness@v1.1.4`** provides hash-pin (`verify`) + `escape-scan`; policy surfaces pinned via `.harness-hash-extra-patterns`. |
| **L2** Static analysis | 🟡 partial | Strict `tsc` ✓. No linter/formatter, no SAST. |
| **L3** Unit & function | 🟢 strong / 🟡 partial enforce | 92 tests, 93% lines, **coverage gate live**. Test quality clean (0 tautologies; asserts > tests every file; only 2 weak asserts, both in the gated E2E). No mutation gate, no CRAP (CRAP tool is Py/Go-only — N/A for TS). |
| **L4** Integration & contract | 🟢 present | Contract schema tests + gated real-Docker E2E. |
| **L5** System (security) | 🟢 partial | replay/bot-reject, journal tamper+truncation detection, default-deny, fail-closed `require`, gate-only mediation. No perf/chaos (not needed at v0). a11y waived (no UI). |
| **L6** E2E / BDD | 🔴 absent | No `features/*.feature`; CLI smoke is manual. |
| **L7** Acceptance / UAT | 🔴 absent | Operator persona documented; live dogfood = bead `agp-3g0` (off-CI). |

## RTM / personas / journeys (this pass)

- **RTM** (`tests/RTM.md`): 41 requirements. **MUST 22/22 covered → 0 P0.** SHOULD 11/11, COULD 3/3. 5 WON'T-at-v0 correctly excluded (durable sessions, exactly-once, operator non-repudiation, multi-tenant/KMS, VM-grade isolation). **No orphaned tests.**
- **Personas** (`tests/PERSONAS.md`): operator ("Jeremy in his truck") 8/9 flows. The one uncovered flow is `live-dogfood-e2e` (gated off-CI, `agp-3g0`).
- **Journeys** (`tests/JOURNEYS.md`): the 7-step governed-session journey. Step-4 live `claude` leg is off-CI (P1); `agp sessions` was untested (P1) — **fixed this pass** (`src/cli/commands/sessions.test.ts`, +4 tests).

## Gap list

**P0:** none (no uncovered MUST).

**P1:**
- ~~`agp sessions` untested~~ → **fixed this pass.**
- Live dogfood (`agp-3g0`) — real `claude` spawn validated off-CI; no in-CI E2E/BDD layer.
- No mutation gate (coverage ≠ assertion strength); no linter.

**P2 / deferred (backlog bead):** mutation testing, Biome linter, BDD/UAT layer, vendoring `@intentsolutions/audit-harness`. Intentionally deferred to keep AGP minimal.

## Escape-scan

No staged diff at audit time → not applicable.

## Handoff

P1 gaps remain (mutation, linter, BDD, harness) but all are **already tracked**
(backlog bead + `agp-3g0`) and were explicitly scoped out as a deliberate
minimalism choice. The one cheap P1 (`agp sessions`) was fixed inline this pass.
No `implement-tests` handoff — the remaining P1s are not "install a measurement
tool and re-run", they're scoped product decisions.
