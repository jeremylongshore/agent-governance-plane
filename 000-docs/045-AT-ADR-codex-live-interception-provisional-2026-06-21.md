---
title: ADR — Codex Live Interception (PROVISIONAL — unmeasured, operator-validated)
date: 2026-06-21
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted (provisional live path)
epic: agp-cln — Add the second harness through the IntendantAdapter contract (GitHub #15, Epic 12)
decision: Ship the gated live Codex path's real bridge + builders now; mark the codex-side interception protocol PROVISIONAL until measured against a real binary
---

# ADR — Codex Live Interception (Provisional)

## Status

Accepted as a **provisional live path** (CTO, 2026-06-21). Implements `agp-cln.2`.
The Codex analogue of `037-AT-ADR` D4 (which *measured* Claude Code's PreToolUse
hook) — except, candidly, **this one is not measured**: no `codex` binary is
available in CI or the authoring environment. This ADR records the design and
**explicitly marks the codex-side interception as unverified**, to be validated by
the operator before the live path is trusted. It fabricates no witnessed run.

## Context

`044-AT-ADR` selected Codex as the second harness and committed to mirroring the
Claude live path: a deterministic reference that gates CI (`InMemoryCodexProcess`,
shipped in `agp-cln.1`) plus a flag-gated, off-CI live path. The live path is where
the honest limitation bites: Claude Code ships a **measured** PreToolUse hook
(`037-AT-ADR` D4), captured against `claude` 2.1.x. AGP has no equivalent measured
spec for Codex's pre-tool-execution interception, and cannot produce one here.

## Decision

### 1. Ship what is real and testable now

`LiveCodexProcess` (`src/intendants/codex/live-codex-process.ts`) ships with:

- **AGP_CODEX_LIVE gating** — `start()` throws (`/gated/`) unless `AGP_CODEX_LIVE=1`,
  exactly like `BunClaudeProcess`. Off-CI by construction.
- **The real GatewayServer bridge** — the same proven, harness-agnostic transport
  the Claude live path uses: the in-harness bridge sends a `ToolCallRequest` over a
  Unix socket; `LiveCodexProcess` surfaces it to `onToolCall` (in Codex's native
  event shape) and blocks until `respond` settles it with the gate's verdict. This
  is unit-tested via a real socket client (allow / deny / no-handler-fails-closed).
- **A pure `buildCodexArgv` builder** — `codex exec <task>`, reusing the operator's
  Codex credentials (no `--api-key`). Unit-tested.
- **The CLI live branch** — `agp run --intendant codex` with `AGP_CODEX_LIVE=1`
  fails closed without `--task`/`--repo`, mirroring the Claude branch.

### 2. What is PROVISIONAL (operator-validated)

The one thing that cannot be built honestly here: **how `codex` is configured to
call the AGP bridge on each tool call** (its hook / config format, and the exact
non-interactive argv). Claude Code has a measured `--settings` PreToolUse hook;
Codex's equivalent is unmeasured. So:

- `buildCodexArgv`'s subcommand/flags are an assumption, marked provisional in code.
- There is intentionally **no `buildCodexHookConfig`** — writing a codex hook-config
  format we have not measured would be fabrication.
- A real governed live run therefore requires the operator to: measure Codex's
  interception protocol against a real binary, wire codex to call `agp bridge` (or
  its equivalent) on the bridge socket, and capture a witnessed run. **Until then
  the live path's interception is unverified.**

### 3. The deterministic reference is the CI gate

Per `044-AT-ADR`, the contract is proven generic by `InMemoryCodexProcess` +
the conformance test (`agp-cln.1`) and the concurrent-session test (`agp-cln.3`) —
both deterministic, both in CI, no binary. The multi-harness claim (`agp-cln.4`)
rests on those, **not** on this provisional live path.

## Consequences

- The live path's AGP-side infrastructure (gating, bridge, builders, CLI) is real
  and tested; only the codex-side interception is provisional.
- No new public claim; the live path is never CI-validated and must not be
  described as proven until the operator's measurement lands.
- A follow-up (operator-driven) replaces this ADR's "provisional" status with a
  measured interception spec once a real `codex` binary validates it.

## References

`044-AT-ADR` (second-harness selection), `037-AT-ADR` (the measured Claude hook this
mirrors), `029-AT-ADR` (Unix-socket gateway). Bead: `agp-cln.2` (epic `agp-cln` / #15).
