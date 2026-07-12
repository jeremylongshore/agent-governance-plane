# agent-governance-plane

> Slack-native, OSS governance for AI coding agents: sandboxed execution, human-in-the-loop approval on every tool call, and a signed audit log of each.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/jeremylongshore/agent-governance-plane/actions/workflows/ci.yml/badge.svg)](https://github.com/jeremylongshore/agent-governance-plane/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jeremylongshore/agent-governance-plane)](https://github.com/jeremylongshore/agent-governance-plane/releases)
[![Toolchain](https://img.shields.io/badge/toolchain-Bun%20%2B%20TypeScript-black.svg)](https://bun.sh)

**Links:** [GitHub Pages](https://jeremylongshore.github.io/agent-governance-plane/) · [Gist one-pager + operator audit](https://gist.github.com/jeremylongshore/523b9e5f58e5724854bdb234a4874a04) · [CCSC substrate](https://github.com/jeremylongshore/claude-code-slack-channel)

## Overview

**agent-governance-plane (AGP)** runs an AI coding agent inside a sandbox, gates
every tool call it attempts — through a policy engine and, where a rule requires
it, a human approval in Slack — and writes each decision to a signed, hash-chained
audit log you can verify offline. It is OSS (Apache-2.0) and single-operator by
default: one `agp run` spawns the agent, governs it through the harness's own hook
interface, and **fails closed** on anything unverified. AGP holds no model
credentials — it gates the agent rather than impersonating it.

It is **multi-harness by contract**: Claude Code and Codex both run through the
same `IntendantAdapter`, policy gate, and signed journal with no harness-specific
path — proven by a conformance test that asserts identical governance for both.

## What Is This?

For each tool call a harness attempts, AGP's daemon runs one **governance loop**
(`src/daemon/daemon.ts`, `mediate()`):

```
intendant tool-call
        │
        ▼
   policy gate ── allow ─────────────────────────────────────────┐
        │ require                                                 │
        ▼                                                         │
  Slack HITL approval ── deny ──► refuse + journal                │
        │ approved                                                │
        ▼                                                         ▼
  signed journal entry ─► sandbox exec ─► journal result ─► deliver verdict/result back
```

The design is **contract-first**: six frozen contracts in `src/contracts/`
(`journal-event`, `policy-verdict`, `gateway-message`, `intendant-adapter`,
`sandbox-provider`, `channel-adapter`) lock the boundaries before code lands, and
`mediate()` is generic over them — so production subsystems swap in without
touching the loop. It **composes the CCSC kernel**
([`claude-code-slack-channel`](https://github.com/jeremylongshore/claude-code-slack-channel)
v0.10.0 — Slack relay, sandbox spawn, policy gate, hash-chained journal) rather
than reinventing it.

### Capabilities

| Capability | Detail |
|------------|--------|
| Per-tool-call gating | Every tool call passes the policy engine (`allow` / `deny` / `require`) before it runs |
| Slack human-in-the-loop | `require` verdicts post to a Slack thread (Socket Mode + Block Kit Allow/Deny/Details); approval is recorded |
| Signed audit log | Every event is written to a hash-chained, Ed25519-signed journal, verifiable offline with `agp verify` against the public key — plus a signed head checkpoint so truncation is detectable |
| Hardened sandbox | Docker with `--cap-drop ALL`, `--security-opt no-new-privileges`, pinned images, and an active network-isolation preflight that **proves** egress is blocked rather than trusting the flag |
| Two harnesses, one contract | Claude Code and Codex via the same `IntendantAdapter`; the Claude Code intendant reuses your existing Claude Code login (no API key held by AGP) |
| Credential injection | `secret:NAME` placeholders resolve to real values only in the post-gate argv; the journal records secret *names*, never values |
| Durable execution | Lease-fenced session store + crash recovery, and a transactional outbox so channel deliveries survive restarts |
| Offline verification | `agp verify` replays the hash chain + signatures with no private key and no network |

### Key Principles

- **Fail-closed by construction** — a check that cannot prove a prerequisite refuses; network is off by default and *proven* off.
- **Gate, don't impersonate** — AGP holds no model credentials; authority routes through a human approver, recorded in the journal.
- **Compose, don't reinvent** — built on the production-shipped CCSC substrate.
- **Honest claims** — public surfaces make exactly one security claim ("signed audit log of every tool call"), enforced as code by a banned-claim scanner (`scripts/claim-scan.sh`).

## Scope

| Supported today | Not yet (deferred, by design) |
|-----------------|-------------------------------|
| Single-operator, self-hosted | Hosted multi-tenant |
| Claude Code + Codex intendants | Additional harnesses (Aider, OpenHands) |
| Docker namespace/cgroup sandbox | VM/Firecracker-grade isolation |
| Full or no egress (Topology A/B) | Model-only egress allowlist enforcement (Topology C — design + pure core shipped; proxy enforcement deferred) |
| Slack HITL (Socket Mode) | Other chat channels |
| Single-tenant journal | Per-human authority attribution (`on_behalf_of` slot reserved; mechanism deferred) |
| Unix-domain-socket gateway | Network transport (forbidden until sender-constrained auth) |

## Quickstart

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.2 (the CLI runs TypeScript directly — no build step)
- Docker (for the sandboxed runtime; `agp doctor` checks the daemon is reachable)
- A Slack workspace + app (bot token, app token, channel) for HITL approvals

### Install

One command (checks prereqs, clones if needed, installs, scaffolds `~/.agp`, drops a disabled example spec, verifies):

```bash
curl -fsSL https://raw.githubusercontent.com/jeremylongshore/agent-governance-plane/main/scripts/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/jeremylongshore/agent-governance-plane.git
cd agent-governance-plane
bun install
```

### Configure & run

```bash
# 1. Scaffold the config home (~/.agp): config + policy skeletons + signing dir
bun run agp -- init

# 2. Mint the Ed25519 journal-signing key (a deliberate, separate step)
bun run agp -- keygen

# 3. Define rules in ~/.agp/policy.json; put Slack creds in ~/.agp/config.json
#    or the AGP_SLACK_* env vars (see Configuration below)

# 4. Validate every prerequisite, fail-closed (docker, slack, signing, policy, sandbox)
bun run agp -- doctor

# 5. Drive a governed session through the loop
bun run agp -- run                                   # scripted reference (safe default)
bun run agp -- run --intendant claude-code --task "fix the failing test" --repo /path/to/repo

# 6. Verify the audit journal offline, and list recorded sessions
bun run agp -- verify
bun run agp -- sessions
```

The CLI surface: `init`, `keygen`, `doctor`, `run`, `verify`, `sessions`
(plus `bridge`, the internal `PreToolUse` hook the harness runs per tool call).
Full reference:
[`000-docs/012-AT-SPEC-cli-surface.md`](000-docs/012-AT-SPEC-cli-surface.md).

## Configuration

State lives under a single config home (`~/.agp`, override with `$AGP_HOME`):
`config.json`, `policy.json`, `signing/`, and the `audit.log` journal. Each `agp
run` axis defaults to the safe reference and **fails closed** when a production
option is requested but unavailable.

| Variable | Purpose |
|----------|---------|
| `AGP_HOME` | Config home (default `~/.agp`) |
| `AGP_SLACK_BOT_TOKEN` / `AGP_SLACK_APP_TOKEN` / `AGP_SLACK_CHANNEL` | Slack credentials (env-first, else `config.json`) |
| `AGP_INTENDANT` / `--intendant` | `scripted` (default) · `claude-code` · `codex` |
| `AGP_CLAUDE_LIVE=1` / `AGP_CODEX_LIVE=1` | Drive the real harness (requires `--task`/`--repo` or `AGP_TASK`/`AGP_REPO`) |
| `AGP_CLAUDE_SANDBOX=docker` | Run the live Claude Code intendant inside a container |
| `AGP_SANDBOX=docker` + `AGP_SANDBOX_IMAGE=<pinned>` | Production Docker sandbox (image must be tag- or digest-pinned) |
| `AGP_CHANNEL=slack` + `AGP_SLACK_LIVE=1` | Production Slack HITL over the Socket Mode receiver |
| `AGP_SANDBOX_EGRESS` + `AGP_SANDBOX_EGRESS_ALLOWLIST` | Egress mode opt-in (`none`/`full`/`allowlist`); `allowlist` fails closed until enforcement lands |
| `AGP_SANDBOX_SKIP_NETCHECK=1` | Dev-only escape hatch — skips the isolation preflight with a loud warning |

## Project Structure

```
src/
├── cli/          # the `agp` operator surface (init/keygen/doctor/run/bridge/verify/sessions)
├── contracts/    # six frozen contracts (zod schemas + types) — the locked boundaries
├── daemon/       # mediate() governance loop, transactional outbox, durable session store
├── intendants/   # per-harness adapters: claude-code/ and codex/
├── channels/     # Slack Socket Mode HITL + nonce replay-protection
├── sandbox/      # hardened Docker provider + network-isolation preflight + credential injection
├── journal/      # signed, hash-chained audit journal + offline verify
├── policy/       # allow/deny/require gate engine + dangerous-pattern detection
├── gateway/      # Unix-domain-socket wire protocol (sandbox ↔ control plane)
├── verify/       # Ed25519 + noop verifiers (intendant identity / supply-chain)
├── tenants/      # multi-tenant context guard (single-tenant v0)
└── runtime/      # reference glue (scripted intendant, in-memory channel/sandbox/crypto)
```

## Development

No build step. Run the gate chain locally before pushing (the L1 pre-commit hook
runs it too — activate hooks on a fresh clone with `bd hooks install`):

```bash
bun run typecheck                 # strict tsc --noEmit
bun run lint                      # Biome
bash scripts/coverage-gate.sh     # bun test --coverage + aggregate floor (lines ≥ 90%, funcs ≥ 88%)
bash scripts/claim-scan.sh        # banned-claim hygiene on public surfaces
scripts/audit-harness verify      # hash-pinned policy surfaces unchanged
scripts/audit-harness escape-scan --staged   # no gate-evasion patterns in the staged diff
```

Releases are automated by `.github/workflows/release.yml` (conventional-commit
driven). Don't hand-edit `version.txt` or the release sections of `CHANGELOG.md`.
See [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md) for the full
workflow.

## Documentation

Design lives in [`000-docs/`](000-docs/) under the doc-filing standard
`NNN-CC-ABCD-description.md`. The foundation set:

| Doc | Purpose |
|-----|---------|
| [001 — AT-DECR](000-docs/001-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md) | ISEDC council decision record — 10 locked P0 decisions |
| [002 — PP-PLAN](000-docs/002-PP-PLAN-agp-master-blueprint-2026-05-27.md) | Master blueprint — the Phase B plan |
| [003 — AA-AUDT](000-docs/003-AA-AUDT-agp-operator-audit-2026-05-27.md) | Operator-grade system analysis (CCSC substrate + AGP composition) |
| [004 — AR-CANN](000-docs/004-AR-CANN-agp-cannon-adversarial-review-2026-05-27.md) | Adversarial review — pre-council input |

The contracts (`013`–`018`), subsystem architecture/specs (Docker sandbox, Slack
adapter, HITL flow, journal schema, gateway protocol), and the ADR stream
(substrate boundary, durable sessions, transactional outbox, intendant identity,
the second harness, multi-tenant gate, Topology C, the authority model) continue
sequentially in `000-docs/`.

## Security

AGP's v0 security posture is deliberately narrow: it makes exactly one claim — a
**signed audit log of every tool call**, verifiable offline. See
[SECURITY.md](SECURITY.md) for vulnerability reporting and the honest threat model
(a container is namespace/cgroup isolation, not a VM boundary).

## License

Apache-2.0 — see [LICENSE](LICENSE).

## Author

**Jeremy Longshore** — [jeremylongshore](https://github.com/jeremylongshore)
