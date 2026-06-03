# TEST_AUDIT.md — agent-governance-plane

> Diagnostic produced by `/audit-tests`. Read-only audit. Transient file.
> Date: 2026-06-03 · Branch: `main` · Version: v0.1.33

## Grade: C+ (74/100)

Excellent L3 **content** (93% line coverage, real security-invariant tests), but
the IS-SOP **enforcement** layers are largely absent: no audit-harness, no
coverage/mutation gate, no linter, no BDD/acceptance layer. The suite is good;
CI does not lock its quality in.

## Classification

| Field | Value |
|---|---|
| Repo type | **cli + library hybrid** (`agp` CLI binary + governance-plane internals) |
| Stack | Bun 1.2.23 + TypeScript (strict, `noEmit`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`) |
| Tests | 16 files, **88 tests** (87 pass / 1 skip), colocated `*.test.ts` |
| Coverage (native `bun test --coverage`) | **91.2% funcs / 93.2% lines** |
| audit-harness | **not installed** (npm latest 0.1.0) |
| `tests/TESTING.md` | absent (no engineer policy declared) |

## Freshness

⚠ `@intentsolutions/audit-harness` is **not installed** in this repo. The IS
Testing SOP requires it as the in-repo enforcement substrate (hash-pin,
escape-scan, CRAP, architecture, bias, Gherkin lint). Node repos install via
`pnpm add -D`; this is a Bun repo, so the vendored `install.sh` path applies.

## 7-layer map

| Layer | Status | Evidence / gap |
|---|---|---|
| **L1** Git hooks & CI enforcement | 🟡 partial | CI has 5 jobs (typecheck+test, claim-scan, doc-drift, markdownlint, bead-validate) — all hard gates except bead-validate. **No pre-commit hooks, no audit-harness, no escape-scan, no hash-pin.** |
| **L2** Static analysis & linting | 🟡 partial | Strict `tsc` typecheck ✓. **No linter/formatter** (CCSC uses Biome; AGP has none). No SAST. |
| **L3** Unit & function | 🟢 strong content / 🟡 partly enforced | 88 tests, 93% lines. **Coverage GATE added** (`scripts/coverage-gate.sh`: aggregate lines≥90 / funcs≥88, in CI). Still no mutation testing, no CRAP gate; Walls 2–7 not enforced. |
| **L4** Integration & contract | 🟢 present | Contract schema tests (`gateway-message`, `policy-verdict`, `journal-event`, `behavioral.test.ts`), gated real-Docker E2E (`AGP_DOCKER_E2E`). |
| **L5** System quality (security) | 🟢 partial | Real security-invariant tests: replay rejection, bot-reject, journal truncation/tamper detection, default-deny, fail-closed `require`, gate-only mediation. No perf/chaos (not needed at v0). a11y **waived** (no UI). |
| **L6** E2E / BDD / Gherkin | 🔴 absent | No `features/*.feature`. CLI smoke (`agp run --sprite …`) is **manual only**, not encoded. |
| **L7** Acceptance / UAT | 🔴 absent | Blueprint persona ("Jeremy in his truck") documented in `000-docs/002` but not encoded as acceptance specs. The live dogfood (`agp-3g0`) is the de-facto UAT, still open. |

## Gap list

**P1 (advisory — would trigger `implement-tests` handoff):**
- L1: `@intentsolutions/audit-harness` not installed; no pre-commit gate.
- L3: no coverage threshold enforced in CI (93% measured, 0% gated).
- L3: no mutation testing (kill-rate unknown — coverage ≠ assertion strength).
- L2: no linter/formatter.
- L6: no Gherkin/acceptance layer; CLI smoke not encoded as a repeatable test.

**P2 (logged):**
- No `tests/TESTING.md` policy file (thresholds, waivers, classification undeclared).
- No RTM / personas / journeys traceability.
- CRAP / bias / architecture gates not run (harness absent).

**Not gaps (correct by design):**
- `runner.ts` (0%) and `bun-claude-process.ts` live spawn (60%) are gated
  real-environment paths (`AGP_DOCKER_E2E` / `AGP_CLAUDE_LIVE`) — deliberately
  not run in CI; honest gating, not a coverage hole to paper over.
- The 1 skip is the gated real-Docker E2E.

## RTM / personas / journeys

Not built — no `tests/RTM.md`, `PERSONAS.md`, or `JOURNEYS.md`. No formal MUST
requirements are declared, so there are **no uncovered-MUST P0 blockers**. The
governance invariants are tested in practice but not traced to declared REQs.

## Escape-scan

Not run (harness absent). No staged diff to scan.

## Handoff

P1 gaps exist → `implement-tests` is the SOP next step. **Branch is `main`
(protected)** → requires explicit confirmation before any filesystem mutation.
Note AGP's deliberate-minimalism constraint (CLAUDE.md: do not scaffold a Node
project / `npm ci`); harness install here must use the Bun/vendored path, and
scope should be agreed before mutating the toolchain.
