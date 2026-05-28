# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is — and What It Is NOT (yet)

**agent-governance-plane (AGP)** — a Slack-native, OSS-first governance plane that runs any agent harness (Claude Code first, Codex next) in a sandbox, gates every tool call through Slack human-in-the-loop approvals, and records each event in a signed, hash-chained audit journal. License Apache-2.0.

**⚠️ This repo currently contains NO source code.** It is in **Phase B, v0 — planning and governance only.** There is no `package.json`, no `src/`, no build step. The first code (the `agp` CLI scaffold) lands with **Epic 04**. Until then, the load-bearing artifacts are the foundation docs in `000-docs/` and the bead-tracked 16-epic plan. Do not scaffold a Node project, add `npm ci`, or assume a TypeScript toolchain exists — the original `/repo-dress` CI made that mistake and failed every PR.

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

## Build & Test

No build. The CI gates (`.github/workflows/ci.yml`) are doc/hygiene checks — run them locally before pushing:

```bash
bash scripts/claim-scan.sh      # HARD GATE: fails on v0-banned security claims in public surfaces
bash scripts/doc-drift.sh       # forbidden pre-monorepo paths + pre-renumbering doc IDs (informational until Epic 00 AAR closes)
bash scripts/bead-validate.sh   # Epic 00 acceptance greps (informational)
npx markdownlint-cli2 --config .markdownlint.json "**/*.md" "!**/CHANGELOG.md"
```

Releases are automated by `.github/workflows/release.yml` (conventional-commit-driven bump → `version.txt` + `CHANGELOG.md` + tag + GitHub release). Don't hand-edit `version.txt` or release sections of `CHANGELOG.md`.

## Conventions specific to this repo

- **Banned claims (v0):** public surfaces (README/AGENTS/CLAUDE/CONTRIBUTING/SECURITY/SUPPORT/`.github/`) may make exactly one security claim — **"signed audit log of every tool call."** A set of stronger assurance terms is banned at v0; the exact denylist regex lives in `scripts/claim-scan.sh`, which blocks any PR that adds one. Read that script before writing security copy — and note it scans this file too, so describe the rule rather than quoting the banned words. (Internal `000-docs/` planning files are out of scope.)
- **Doc filing:** new docs go in `000-docs/` as `NNN-CC-ABCD-description.md` (sequential `NNN`); never reuse a number or rename foundation docs `001`–`004`.
- **Beads prefix:** `agp-` (e.g. `agp-7j5`). Work is organized as plain-English epics + child beads mirrored to GitHub issues; quote the title, not the system ID.
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
