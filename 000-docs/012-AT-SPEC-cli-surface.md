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

The Claude Code intendant reuses the operator's existing **Claude Code login
session** — AGP holds **no Anthropic API key** (Epic 00 contradiction C7). Quotas
inherit from the operator's plan; re-auth is handled by `claude`, not by AGP.

## Commands

| Command | Status | Exit codes |
|---------|--------|-----------|
| `agp init [--force]` | **implemented** | `0` always (idempotent; `--force` overwrites) |
| `agp keygen [--force]` | **implemented** | `0` wrote key · `1` exists without `--force` |
| `agp doctor` | **implemented** | `0` healthy · `1` any prerequisite missing (fail-closed) |
| `agp run` | **implemented** (v0 reference mode) | `0` ran · `1` missing/invalid signing key or policy (fail-closed) |
| `agp verify` | **implemented** | `0` journal intact · `1` tampering / broken chain / missing key |
| `agp sessions` | **implemented** | `0` (lists sessions from the journal) |
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

### `agp run`

Drives a session through the daemon governance loop: policy gate → (if
`require`) channel HITL → signed journal → sandbox exec → journal result. Each
subsystem axis **defaults to the safe reference** and is upgraded to its
production implementation by a selector; an unavailable production option
**fails closed** (never silently falls back):

| Subsystem | Default (reference) | Production | Selector |
|-----------|---------------------|-----------|----------|
| Intendant | scripted self-test | Claude Code intendant (Epic 06 ✓) | `--intendant claude-code` (reference harness; live spawn off-CI, `agp-3g0`) |
| Sandbox | recording (runs nothing) | Docker namespace isolation (Epic 07 ✓) | `AGP_SANDBOX=docker` + `AGP_SANDBOX_IMAGE=<pinned>` |
| Channel | console; **auto-denies** (`AGP_AUTO_APPROVE=1` to approve, local only) | Slack HITL (Epic 08 ✓ posting; receiver pending) | `AGP_CHANNEL=slack` — fails closed pending the Socket-Mode interaction receiver (`agp-e7c`) |
| Policy | — (always production) | policy engine, default-deny (Epic 09 ✓) | always on; rules from `policy.json` |
| Journal | — (always production) | signed hash-chained journal (Epic 10 ✓) | always on |

`run` fails closed on a missing/invalid signing key or policy, on
`AGP_SANDBOX=docker` without a reachable daemon or pinned image, and on
`AGP_CHANNEL=slack` without Slack config or (currently) the interaction
receiver. The `substrate/ccsc/` vendor copy (ADR `009-AT-ADR`) is tracked under
Epic 02 (`agp-7ii`).

## Architecture notes

- The doctor checks are a pure function (`src/cli/checks.ts`) over an injected
  `DoctorProbe`, so they are unit-tested without Docker/Slack/keys present and
  without mocking the unit under test. The real probe (`src/cli/probe.ts`)
  answers each check against the live environment.
- The daemon orchestration (`src/daemon/daemon.ts`) `mediate` loop is generic
  over the six contracts; the reference subsystems live in `src/runtime/`. The
  journal is hash-chained + Ed25519-signed; `agp verify` re-derives both offline
  and detects any tampering.
