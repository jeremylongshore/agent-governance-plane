# agent-governance-plane

> Slack-native, OSS governance for AI coding agents: sandboxed execution, human-in-the-loop approval on every tool call, and a signed audit log of each.

[![License](https://img.shields.io/badge/license-Apache-2.0-blue.svg)](LICENSE)
[![CI](https://github.com/jeremylongshore/agent-governance-plane/actions/workflows/ci.yml/badge.svg)](https://github.com/jeremylongshore/agent-governance-plane/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jeremylongshore/agent-governance-plane)](https://github.com/jeremylongshore/agent-governance-plane/releases)

## Overview

**agent-governance-plane (AGP)** runs an AI coding agent inside a sandbox, gates
every tool call it attempts — through a policy engine and, where a rule requires
it, a human approval in Slack — and writes each decision to a signed, hash-chained
audit log you can verify offline. It is OSS (Apache-2.0) and single-operator by
default: one `agp run` spawns the agent, governs it through the harness's own hook
interface, and **fails closed** on anything unverified. AGP holds no model
credentials and gates the agent rather than impersonating it.

> **Status:** Phase B, pre-1.0. The operator CLI is live — `agp init`, `keygen`,
> `doctor`, `run`, `verify`, `sessions` — over a contract-first daemon with real
> subsystems: Docker sandbox (credential injection + verified network isolation),
> signed hash-chained journal, policy engine, the Claude Code **intendant** (the
> per-harness adapter), Slack HITL over a Socket Mode receiver, and a Unix-socket
> gateway. The live dogfood is proven end-to-end: real Claude Code obeys the gate
> — on the host and inside a container — and the run produces a journal that
> `agp verify` replays. See the
> [16-epic plan](000-docs/002-PP-PLAN-agp-master-blueprint-2026-05-27.md).

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.2 (the CLI runs TypeScript directly)
- Docker (for the sandboxed runtime; `agp doctor` checks it)
- A Slack workspace + app (bot token, app token, channel) for HITL approvals

### Installation

```bash
git clone https://github.com/jeremylongshore/agent-governance-plane.git
cd agent-governance-plane
bun install
```

## Usage

```bash
# 1. Scaffold the operator config home (~/.agp): config + policy skeletons + signing dir
bun run agp -- init

# 2. Mint the Ed25519 journal-signing key (deliberate, separate step)
bun run agp -- keygen

# 3. Define rules in ~/.agp/policy.json; (optional) Slack creds in config.json or AGP_SLACK_* env

# 4. Validate every prerequisite, fail-closed (Docker, Slack, signing key, policy)
bun run agp -- doctor

# 5. Drive a governed session through the loop (policy gate → HITL → signed journal → sandbox)
bun run agp -- run

# 6. Verify the audit journal offline (hash chain + Ed25519 signatures); list sessions
bun run agp -- verify
bun run agp -- sessions
```

**`agp run` subsystem selection** — each defaults to the safe reference and
fails closed when a production option is requested but unavailable:

| Axis | Default | Production | Selector |
|------|---------|-----------|----------|
| Sandbox | recording (runs nothing) | Docker namespace isolation | `AGP_SANDBOX=docker` + `AGP_SANDBOX_IMAGE=<pinned>` |
| Intendant | scripted self-test | Claude Code | `--intendant claude-code` + `AGP_CLAUDE_LIVE=1` (add `AGP_CLAUDE_SANDBOX=docker` to run it in a container) |
| Channel | console (fail-closed deny) | Slack HITL | `AGP_CHANNEL=slack` + `AGP_SLACK_LIVE=1` (Socket Mode receiver) |

Full command reference:
[`000-docs/012-AT-SPEC-cli-surface.md`](000-docs/012-AT-SPEC-cli-surface.md).

The Claude Code intendant reuses your existing **Claude Code login session** — AGP
holds no Anthropic API key (in a container it authenticates with `ANTHROPIC_API_KEY`,
passed by name so the value never enters the process arguments).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

```bash
bun run typecheck   # tsc --noEmit
bun test            # CLI unit tests
```

## Documentation

Foundation docs in [`000-docs/`](000-docs/) (Phase A — ISEDC council, 2026-05-27):

| Doc | Purpose |
|-----|---------|
| [001 — AT-DECR](000-docs/001-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md) | ISEDC council decision record — 10 locked P0 decisions (Apache 2.0, honest threat model, MARKETING_CLAIMS.md as code, single-tenant v0, no public RFCs at v0, schema-slot reservation, Sigstore by v0.6, 4-phase CSO sequencing) |
| [002 — PP-PLAN](000-docs/002-PP-PLAN-agp-master-blueprint-2026-05-27.md) | Master blueprint — single entry point for third-party reviewers |
| [003 — AA-AUDT](000-docs/003-AA-AUDT-agp-operator-audit-2026-05-27.md) | Operator-grade system analysis (CCSC substrate + AGP composition) |
| [004 — AR-CANN](000-docs/004-AR-CANN-agp-cannon-adversarial-review-2026-05-27.md) | Cannon adversarial review — 4-agent pre-council input |

Design ADRs and contract specs land here as the 16-epic Phase B plan executes. See open [epic issues](https://github.com/jeremylongshore/agent-governance-plane/issues?q=is%3Aissue+label%3Aepic+OR+%22%5BAGP+Epic%22) for in-flight work.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

This project is licensed under the Apache-2.0 License — see [LICENSE](LICENSE) for details.

## Author

**Jeremy Longshore** — [jeremylongshore](https://github.com/jeremylongshore)
