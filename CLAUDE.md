# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is — and What It Is NOT (yet)

**agent-governance-plane (AGP)** — a Slack-native, OSS-first governance plane that runs any agent harness (Claude Code first, Codex next) in a sandbox, gates every tool call through Slack human-in-the-loop approvals, and records each event in a signed, hash-chained audit journal. License Apache-2.0.

**Phase B, v0 — implementation in flight.** The `agp` CLI + governance kernel now exist: a **Bun + TypeScript** codebase under `src/` (`package.json`, `bunfig.toml`, strict `tsc --noEmit`, `bun test`). The contract-first daemon and its real subsystems are in-tree — Docker sandbox, Slack HITL (Socket Mode), signed hash-chained journal, policy engine, Unix-socket gateway, durable session leases, transactional outbox, and a multi-tenant context gate — alongside **two** per-harness intendants (the adapter renamed from "sprite", `000-docs/038-AT-ADR`): **Claude Code** first and **Codex** second (`044-AT-ADR`). Foundation docs `001`–`004` lock the strategy; the live design source of truth is the bead-tracked epic plan (`002-PP-PLAN`) plus the post-v0 roadmap (`039-PP-ROAD`) and the ADR/contract stream now running to `051`. **This is a Bun toolchain, not Node/npm** — do not add `npm ci`/`pnpm`; use `bun install`, `bun test`, `bun run typecheck`. (Historical note: the original `/repo-dress` CI assumed a Node project before any code existed and failed every PR — hence the Bun-native CI.)

## The CCSC substrate (most important orienting fact)

AGP does not build its governance kernel from scratch. It **composes the production-shipped CCSC kernel** — `claude-code-slack-channel` (CCSC v0.10.0, local clone at `~/000-projects/claude-code-slack-channel/`). The Slack relay, Docker sandbox spawn, `policy.ts` gate, and hash-chained `journal.ts` all originate there. Epic 02 decides *how* AGP consumes CCSC (substrate-extraction ADR — **not** an assumed direct monorepo import; that framing was explicitly rejected). When reasoning about runtime behavior, read CCSC primitives, not greenfield designs.

## Foundation docs — read before any planning/design work

`000-docs/` uses the doc-filing standard `NNN-CC-ABCD-description.md`. These are the source of truth; the council decisions in them override casual assumptions:

| Doc | What it locks |
|-----|---------------|
| `001-AT-DECR` | ISEDC council decision record — 10 locked P0 decisions (Apache 2.0, honest threat model, single-tenant v0, no public surface until defensible, Sigstore by v0.6) |
| `002-PP-PLAN` | Master blueprint — the 16-epic Phase B plan (Epics 00–15) is the live source of truth for scheduled work; the old "v0→v0.1→v0.2 demo" narrative is superseded |
| `003-AA-AUDT` | Operator audit — CCSC substrate + AGP composition, threat boundaries |
| `004-AR-CANN` / `005`–`007` | Adversarial review + structural/crossref/contradiction audits |

## Architecture — the governance loop (read before touching `src/`)

The design is **contract-first**: `src/contracts/` holds the six interfaces frozen by Epic 03 (`journal-event`, `policy-verdict`, `gateway-message`, `intendant-adapter`, `sandbox-provider`, `channel-adapter` — each a Zod schema + TS type, each with a matching `000-docs/0NN-AT-CONT-*.md`). They are **internal/unstable, no public RFC**; change one only via a Bead + an ADR. The daemon's core is generic over these interfaces, so a subsystem epic swaps in a production impl without touching the loop. **Invariant Greptile enforces:** leaf layers must not import the daemon, and contracts stay frozen.

The heavily-tested heart is `src/daemon/daemon.ts` `mediate()` — for each tool call an intendant attempts:

> policy gate → (if verdict is `require`) channel HITL approval → signed journal entry → sandbox exec → journal the result → deliver result/verdict back to the intendant.

It is **fail-closed** end to end (malformed input, a missing prereq, or an unverifiable frame is rejected, never partially processed). Subsystem layout under `src/`:

| Dir | Role |
|-----|------|
| `cli/` | The `agp` operator surface (entry `cli/index.ts`): `init`, `keygen`, `doctor` (fail-closed prereq checks), `run` (drive a session — `--intendant scripted\|claude-code\|codex`), `bridge` (the PreToolUse hook Claude runs per tool call), `verify` (offline journal check), `sessions`. |
| `contracts/` | The six frozen contracts (above) + later additions (`session-lease`, `verifier`, `intendant-manifest`, `outbox-delivery`). |
| `daemon/` | Control plane: `mediate()` loop, `outbox-*` (transactional channel delivery, `042-AT-ADR`), `session-store` (durable leases, `041-AT-ADR`). |
| `gateway/` | Wire protocol between a **sandboxed** intendant and the control plane. v0 transport is a **Unix domain socket only** — network is forbidden until sender-constrained auth lands (`029-AT-ADR`, confused-deputy rationale). Strict newline-delimited JSON framing, 1 MiB max frame. |
| `intendants/` | Per-harness adapters: `claude-code/` (reuses your existing Claude Code login — **AGP holds no Anthropic API key**) and `codex/` (`044`/`045-AT-ADR`). |
| `channels/slack/` | Slack HITL channel over Socket Mode; `nonce-store` for replay protection (`048-AT-DECR`). |
| `journal/` | Signed, hash-chained audit journal + offline `verify`. |
| `policy/` | The gate engine (`allow`/`deny`/`require`) + dangerous-pattern detection. |
| `sandbox/docker/` | Docker sandbox provider + network preflight; `credentials.ts` resolves `{{secret:NAME}}` placeholders to real values **only in the post-gate argv** (`034-AT-ARCH`). |
| `tenants/` | Multi-tenant context guard — single-tenant v0, gate decided in `047-AT-ADR`. |
| `verify/` | Ed25519 + noop verifiers for intendant identity / supply-chain (`043-AT-ADR`). |
| `runtime/` | Reference glue impls (scripted intendant, in-memory channel/sandbox/crypto) for `agp run` reference mode + tests. |

AGP defines the `trigger-source` contract and the daemon's `runMediated()` (a trigger-woken intendant's every tool call is mediated through the loop), but the trigger-woken **agents** themselves — the GitHub watcher, its `agp watch` operator surface, and the per-agent template test packs — were **extracted** to the composing product repo, `jeremylongshore/iam-bob-intendant` (formerly `bob-the-intendant`; 2026-07-12, per intent-eval-lab `109-AT-DECR`; see `000-docs/059-AT-ADR`). AGP stays the clean governance plane; IAM Bob Intendant composes it as a pinned dependency and owns the specialized watcher/application layer.

Tests live next to source (`*.test.ts`); live/E2E paths are gated behind `AGP_DOCKER_E2E` / `AGP_CLAUDE_LIVE` / `AGP_CODEX_LIVE` env flags so the default `bun test` stays hermetic.

## Build & Test

No build. The CI gates (`.github/workflows/ci.yml`) are a `code` job (typecheck + tests + coverage gate) plus doc/hygiene checks — run them locally before pushing:

```bash
bun run typecheck               # HARD GATE: strict tsc --noEmit
bun run lint                    # HARD GATE: Biome linter (src/), recommended rules
bash scripts/coverage-gate.sh   # HARD GATE: bun test --coverage + aggregate floor (lines>=90, funcs>=88)
bash scripts/claim-scan.sh      # HARD GATE: fails on v0-banned security claims in public surfaces
bash scripts/doc-drift.sh       # forbidden pre-monorepo paths + pre-renumbering doc IDs (informational until Epic 00 AAR closes)
bash scripts/bead-validate.sh   # Epic 00 acceptance greps (informational)
npx markdownlint-cli2 --config .markdownlint.json "**/*.md" "!node_modules/**" "!**/CHANGELOG.md"
scripts/audit-harness verify    # HARD GATE: hash-pinned policy surfaces unchanged (else re-pin: scripts/audit-harness init)
scripts/audit-harness escape-scan --staged   # HARD GATE: no gate-evasion patterns in the staged diff
```

**Linter:** Biome (`biome.json`, devDep `@biomejs/biome`), linter-only (formatter/assist off) over `src/`, recommended rules. Two style rules are deliberately **off**: `noNonNullAssertion` (conflicts with the repo's `noUncheckedIndexedAccess` → `arr[i]!` idiom) and `useTemplate` (pure-style churn; also avoids an unsafe-fix on the intentional `"lat"+"est"` image tag). `biome.json` is hash-pinned, so loosening a rule needs a deliberate `scripts/audit-harness init` re-pin.

**Vendored `@intentsolutions/audit-harness`** (`.audit-harness/`, v1.3.0, wrapper `scripts/audit-harness` — no npm dep). It hash-pins AGP's policy surfaces (`MARKETING_CLAIMS.md`, the gate scripts, `tests/TESTING.md`, `tests/RTM.md` — see `.harness-hash-extra-patterns`); editing any of them requires a deliberate `scripts/audit-harness init` re-pin, and `verify` blocks an un-re-pinned edit. Upgrade with `AUDIT_HARNESS_VERSION=vX.Y.Z` + the install.sh (note: the install.sh's unpack-dir glob needs `*audit-harness-*` — the release tarball root is `intent-audit-harness-<ver>`).

The **pre-commit hook** (L1) runs all the above locally before each commit — logic in `scripts/pre-commit-gates.sh`, wired into `.beads/hooks/pre-commit` above bd's managed markers (bd preserves it across reinstalls; no `core.hooksPath` conflict). Activate git hooks on a fresh clone with `bd hooks install`; bypass once with `git commit --no-verify`.

The coverage gate enforces the project **aggregate** (Bun's built-in per-file `coverageThreshold` is too blunt for the deliberately gated `AGP_DOCKER_E2E` / `AGP_CLAUDE_LIVE` paths). Floors live in `scripts/coverage-gate.sh`; raise them as gated paths gain in-CI coverage, never lower to dodge a regression. Last `/audit-tests`: see `TEST_AUDIT.md`.

Releases are automated by `.github/workflows/release.yml` (conventional-commit-driven bump → `version.txt` + `CHANGELOG.md` + tag + GitHub release). Don't hand-edit `version.txt` or release sections of `CHANGELOG.md`.

## Conventions specific to this repo

- **Banned claims (v0):** public surfaces (README/AGENTS/CLAUDE/CONTRIBUTING/SECURITY/SUPPORT/`.github/`) may make exactly one security claim — **"signed audit log of every tool call."** A set of stronger assurance terms is banned at v0; the exact denylist regex lives in `scripts/claim-scan.sh`, which blocks any PR that adds one. Read that script before writing security copy — and note it scans this file too, so describe the rule rather than quoting the banned words. (Internal `000-docs/` planning files are out of scope.)
- **ACS conformance — DECIDED but GATED + DEFERRED (ISEDC ruling, `000-docs/050-AT-DECR`):** the council decided AGP will conform to the **ACS policy-verdict profile** at the `gate()` boundary (map native allow/deny/require → ACS allow/warn/deny/escalate) **when there is real pull — never speculatively** (single-operator v0 has none; the build is deferred). Guardrails every agent MUST respect: **(1) Q5 stays locked** — conforming to an existing open spec is *not* authoring a rival spec; do **not** publish an AGP spec/RFC at v0. **(2) No public "ACS-conformant" claim** until passing conformance tests **and** trademark/mark-use clearance (the "ACS" name is not licensed by the spec's MIT text) **and** the CISO claim-veto; register any such claim in `MARKETING_CLAIMS.md` first, scope it to the policy-verdict profile only, never imply transport/audit conformance, and never adopt ACS's stronger assurance marketing (the `claim-scan` denylisted terms). **(3) Policy manifest is export-only;** importing an external manifest is a governance-bypass surface — defer behind Ed25519 manifest signing. Gated implementation path: `050-AT-DECR`.
- **Doc filing:** new docs go in `000-docs/` as `NNN-CC-ABCD-description.md` (sequential `NNN`); never reuse a number or rename foundation docs `001`–`004`.
- **Beads prefix:** `agp-` (e.g. `agp-7j5`). Work is organized as plain-English epics + child beads mirrored to GitHub issues; quote the title, not the system ID.
- **AI PR review: Greptile** (adopted 2026-06-23, replacing CodeRabbit + Gemini Code Assist, both cancelled). Per-repo config in the `.greptile/` folder (Greptile's recommended format; `greptile.json` is the legacy single-file form): `.greptile/config.json` = strictness + ignore patterns + AGP-aware `rules` (claim-control denylist, Bun-not-npm, leaf-layers-must-not-import-daemon, fail-closed/frozen-contract invariants), and `.greptile/files.json` = standing review context (`CLAUDE.md`, `MARKETING_CLAIMS.md`). The deterministic gate remains the required CI checks above; Greptile is advisory review on top. `config.json` also wires `fixWithAI` + cross-repo context to the CCSC substrate. **Standing discipline:** 👍/👎 Greptile's PR comments every review so the bot adapts (the learning loop — the highest-value free lever). Full lever inventory + ROI cadence ("are we using what we pay for"): `000-docs/051-OD-PLAY`. The GitHub-App swap itself (uninstall CodeRabbit/Gemini, install Greptile) is an org-admin action, not in-repo.
- Commits `<type>(<scope>): <subject>`; branches `feature/`, `fix/`, `docs/`; feature branch → PR → review → merge.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
