---
title: AGP CLI Surface
date: 2026-06-01
author: Jeremy Longshore
type: Specification (SPEC)
epic: Epic 04 — Build the AGP CLI and local daemon (bead agp-ixv)
status: Living — implemented commands marked; runtime commands pending Epic 03
---

# AGP CLI Surface

`agp` is the operator command surface for the agent governance plane. It runs on
[Bun](https://bun.sh) (the binary is `./src/cli/index.ts` with a `#!/usr/bin/env bun`
shebang; `bun run agp -- <command>` during development).

AGP is **single-tenant and operator-owned at v0.** All operator state lives under
a single config home (default `~/.agp`, overridable with `$AGP_HOME`).

## Claude authentication

The Claude Code sprite reuses the operator's existing **Claude Code login
session** — AGP holds **no Anthropic API key** (Epic 00 contradiction C7). Quotas
inherit from the operator's plan; re-auth is handled by `claude`, not by AGP.

## Commands

| Command | Status | Exit codes |
|---------|--------|-----------|
| `agp init [--force]` | **implemented** | `0` always (idempotent; `--force` overwrites) |
| `agp doctor` | **implemented** | `0` healthy · `1` any prerequisite missing (fail-closed) |
| `agp run` | pending (Epic 03 + daemon) | `2` not implemented |
| `agp verify` | pending (Epic 03 + daemon) | `2` not implemented |
| `agp sessions` | pending (Epic 03 + daemon) | `2` not implemented |
| `agp help` | implemented | `0` |

### `agp init`

Scaffolds the config home: writes `config.json` and `policy.json` skeletons and
creates the `signing/` directory. It does **not** mint the Ed25519 journal
signing key — that is a deliberate operator step, and `agp doctor` reports it
missing until done. `init` never overwrites existing files without `--force`, so
re-running is safe.

### `agp doctor`

Validates, **fail-closed**, every prerequisite before any session can run. A
check that cannot prove its prerequisite is satisfied reports `✗`, and any `✗`
makes `doctor` exit non-zero.

| Check | Passes when |
|-------|-------------|
| `docker` | `docker` CLI is on `PATH` **and** the daemon is reachable (`docker info`) |
| `slack` | bot token, app token, and channel are all set (env `AGP_SLACK_*` or `config.json`) |
| `signing` | the Ed25519 journal-signing key exists at `~/.agp/signing/journal-ed25519.key` |
| `policy` | `~/.agp/policy.json` exists, parses as JSON, is an object, and has a `rules` key |

## Config home layout (`~/.agp`)

| Path | Purpose |
|------|---------|
| `config.json` | operator config (Slack workspace/channel, sandbox options) |
| `policy.json` | the policy file gating tool calls |
| `signing/journal-ed25519.key` | Ed25519 key signing the audit journal |
| `audit.log` | the authoritative hash-chained journal (written at runtime) |

Slack credentials may instead be supplied via `AGP_SLACK_BOT_TOKEN`,
`AGP_SLACK_APP_TOKEN`, `AGP_SLACK_CHANNEL` (env wins over `config.json`).

## Architecture notes

- The doctor checks are a pure function (`src/cli/checks.ts`) over an injected
  `DoctorProbe`, so they are unit-tested without Docker/Slack/keys present and
  without mocking the unit under test. The real probe (`src/cli/probe.ts`)
  answers each check against the live environment.
- `run` / `verify` / `sessions` are registered but exit `2` ("not implemented")
  rather than fake capability. They depend on the Epic 03 core contracts and the
  Epic 04 daemon, plus the vendored CCSC kernel (`substrate/ccsc/`, copied per
  ADR `009-AT-ADR` when this runtime lands).
