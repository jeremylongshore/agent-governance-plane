---
title: Greptile Utilization Map — the org-wide playbook for getting full value from the paid tool
date: 2026-06-23
author: Jeremy Longshore
type: Operational playbook (OD-PLAY)
scope: All Intent Solutions repos (Greptile is org-level). Housed here in the active repo; AGP is the reference implementation.
---

# Greptile Utilization Map

## Why this exists

Greptile is a **paid** tool adopted 2026-06-23 (replacing CodeRabbit + Gemini Code
Assist). "Set up the bot and forget it" is how teams pay for a tool and use a third
of it. This map makes utilization **observable**: every lever Greptile offers, our
status, and whether it's worth using — so "are we using what we pay for?" is a
10-second glance, not a guess. The rule is **deliberate skips, not accidental
neglect** — not every lever should be on; none valuable should be off by accident.

## The lever map

Status: ✅ on · ⚪ default/partial · ❌ unused · 🚫 skip (deliberate)

| Lever | Status | Where | Verdict |
|-------|--------|-------|---------|
| PR review bot | ✅ | org GitHub App | Core. |
| `.greptile/config.json` — strictness / commentTypes / ignorePatterns / instructions | ✅ | AGP repo | Tuned (strictness 2; logic/syntax/style). |
| `.greptile/config.json` `rules` (id/scope/severity) | ✅ 4 rules | AGP repo | claim-control, bun-not-npm, leaf-no-daemon-import, fail-closed-invariants. |
| `.greptile/files.json` standing context | ✅ 2 files | AGP repo | `CLAUDE.md` + `MARKETING_CLAIMS.md`. Expand with foundation/roadmap docs as needed. |
| **Learning loop** (👍/👎 on review comments) | ✅ **discipline adopted 2026-06-23** | per-PR behavior | **Highest free lever.** Adapts the bot to our taste over ~2–3 wks. Standing discipline: vote on Greptile comments every PR. |
| **Cross-repo context** (`context.repos`) | ✅ **wired 2026-06-23** | AGP repo | Points AGP reviews at the **CCSC substrate** (`jeremylongshore/claude-code-slack-channel`) AGP composes. |
| **`fixWithAI`** (auto-suggest fixes) | ✅ **on 2026-06-23** | AGP repo | Evaluate fix quality over the next several PRs; keep if useful. |
| `.greptile/rules.md` (free-form guidelines) | ❌ | — | Structured `rules` cover it; add only if free-form prose is needed. |
| Custom-context uploads (dashboard) | ❌ | dashboard | Overlaps `files.json`; skip unless a doc can't live in-repo. |
| PR filters (labels/authors/branches/keywords, fileChangeLimit) | ⚪ default | — | Defaults fine for a single-operator repo. |
| Output sections (issues table / confidence / sequence diagram / summary) | ⚪ default | — | Defaults fine; tune only if reviews are too noisy/sparse. |
| `statusCheck` (Greptile as a PR check) | ✅ | observed on PRs | "Greptile Review" check appears; advisory — the deterministic gate stays the required CI checks. |
| **Dashboard analytics** (catch-rate, accepted comments) | ❌ never checked | greptile.com dashboard | **Our ROI readout.** Glance each release — is the bot catching real issues, are we accepting its comments? |
| REST API `/repositories` `/query` `/search` | 🚫 for now | api.greptile.com/v2 | Codebase Q&A, not reviewer config. Reach for it only to build a helper on a large/unfamiliar codebase. |
| MCP server | 🚫 | — | Deliberately skipped: native Grep/Read/Explore already cover a repo this size; an indexed snapshot risks staleness vs live reads. Revisit for a large/unfamiliar codebase. |
| CLI / VS Code extension | 🚫 | — | N/A to the Claude Code workflow. |

## What changed today (the three levers wired)

1. **Learning loop** — adopted as a standing discipline: 👍/👎 Greptile's review
   comments on every PR so the bot adapts. (No config knob — it's behavior.)
2. **Cross-repo context** — `context.repos: ["jeremylongshore/claude-code-slack-channel"]`
   so AGP reviews understand the CCSC kernel AGP composes.
3. **`fixWithAI: true`** — Greptile proposes fixes; we evaluate quality and keep if
   it earns its place.

## The cadence (how we keep knowing)

- **At each AGP release** (the release workflow already recurs — no invented
  schedule): glance at the Greptile dashboard catch-rate/accept-rate, and re-scan
  this map for any valuable lever that drifted to ❌.
- **When starting a new epic:** scope a `.greptile/config.json` rule to the epic's
  active dirs and add the epic's ADR to `.greptile/files.json`; strip both at epic
  close. (Task-aware reviews without the API.)
- **Update this map** whenever a lever's status changes — it is the single source of
  truth for "are we using what we pay for."

## Per-repo rollout

AGP is the reference implementation (this repo). The other Intent Solutions repos'
swap (remove `.coderabbit.yaml`/`.gemini/`, add `.greptile/`) is being handled
separately; this map is the org-wide template for what "fully utilized" looks like
in each. The GitHub-App swap (uninstall CodeRabbit/Gemini, install Greptile) is an
org-admin action, not in-repo.

## References

- [.greptile/ reference](https://www.greptile.com/docs/code-review/greptile-config-reference)
- [greptile.json reference](https://www.greptile.com/docs/code-review/greptile-json-reference)
- [custom standards & rules](https://www.greptile.com/docs/code-review/custom-standards)
- [API introduction](https://www.greptile.com/docs/api-reference/introduction)
- [learning & custom context](https://www.greptile.com/learning)
- AGP `.greptile/config.json` + `.greptile/files.json` (the live config this map tracks).
