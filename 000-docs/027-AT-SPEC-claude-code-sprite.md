---
title: "Specification: Claude Code Sprite"
date: 2026-06-02
author: Jeremy Longshore
type: Specification (SPEC)
epic: Epic 06 — Claude Code sprite, the first AGP harness adapter (bead agp-92v)
source: src/sprites/claude-code/
---

# Specification: Claude Code Sprite

AGP's first real harness adapter. It drives Claude Code through the **frozen**
`SpriteAdapter` contract ([`016-AT-CONT`](016-AT-CONT-sprite-adapter.md)) with no
one-off backdoor, so every tool the harness attempts passes the same policy +
journal gate as any other sprite.

## Authentication — login session, no API key

The sprite reuses the operator's existing **Claude Code login session**. AGP
holds **no Anthropic API key** (CLI spec [`012-AT-SPEC`](012-AT-SPEC-cli-surface.md),
Epic-00 contradiction C7). Quotas inherit from the operator's plan; re-auth is
`claude`'s job, not AGP's.

## Interception mechanism — the PreToolUse hook

Anthropic's external-message-injection / ACP wire
(`anthropics/claude-code#53049`) is not shipped, so AGP intercepts at Claude
Code's **PreToolUse hook** — the stable, login-preserving seam. Each hook
invocation **blocks** the harness until a decision returns. That back-pressure is
modelled directly in the `ClaudeProcess` seam: one tool call is surfaced, the
harness waits, the gate decides, the harness continues.

```
claude (PreToolUse hook) ──blocks──▶ ClaudeProcess.onPreToolUse
        ▲                                     │
        │ allow / deny                        ▼
   respond(callId) ◀── ClaudeCodeSprite.deliver ◀── daemon.gate (policy→HITL→journal)
```

## Gate-only mediation (the harness executes its own tools)

A real harness runs its tools **inside the sandbox itself**. AGP therefore
**gates** each call (allow/deny) and never proxy-executes it — unlike the scripted
reference, where the daemon runs the proposed command in the sandbox on the
sprite's behalf. Two daemon drivers, two honest models:

| Driver | Sprite | Execution | Sandbox role |
|--------|--------|-----------|--------------|
| `runScripted` | `ScriptedSprite` | daemon proxy-executes via `sandbox.exec` | runs each proposed command |
| `runLive` | `ClaudeCodeSprite` | the harness executes in-sandbox | contains the `claude` process |

`Daemon.gate` mirrors CCSC's `gate()`: `policy.evaluate → (if require) channel
HITL → signed journal → deliver the EFFECTIVE verdict back to the blocked hook`.
It journals `tool_call.<decision>` and `gate.<allow|deny>`; the harness sees an
allow (proceed) or deny (with reason). `MediationOutcome.executed` is always
`false` on this path — AGP did not run the tool.

## The RunnableSprite extension

`runLive` needs to drive the harness to completion. The frozen `SpriteAdapter`
has no `run`, so a real harness emits calls asynchronously rather than via
`ScriptedSprite.emitAll`. `RunnableSprite` (defined in `src/daemon/daemon.ts`)
**extends** `SpriteAdapter` with `run(sessionId): Promise<void>` — the live
analogue of `emitAll`. This is an **additive** interface: the `SpriteAdapter`
contract itself is untouched, so no Bead+ADR is required (per `016` Stability).

## The ClaudeProcess seam

`ClaudeProcess` separates the sprite's protocol logic from the harness I/O —
the same split as the Slack epic's transport/interaction seam:

- **`InMemoryClaudeProcess`** — deterministic, models hook back-pressure with a
  fixed tool-call script. Drives the unit tests and the v0
  `agp run --sprite claude-code` reference.
- **`BunClaudeProcess`** — the real binary. Its pure builders
  (`buildHookSettings`, `buildClaudeArgs`) are unit-tested; the spawn itself is
  **gated behind `AGP_CLAUDE_LIVE=1`** (mirrors `AGP_DOCKER_E2E`) because a
  login-authenticated, interactive harness cannot run in CI.

## Live path (manual dogfood)

`agp run --sprite claude-code` runs the deterministic reference. The live spawn
is the manual dogfood — "run AGP on a real CCSC bug fix" — and is **validated
off-CI** on the operator's machine. When wired, `BunClaudeProcess` will:

1. write a settings file whose `PreToolUse` hook is a bridge command;
2. the bridge POSTs `{callId, tool, args}` to AGP over the session Unix socket
   (blueprint §3.1 topology) and blocks for the verdict;
3. translate the verdict into the hook's allow/deny exit protocol;
4. `Bun.spawn` `claude` inside the Docker sandbox with the task prompt — no
   Anthropic credential ever reaches AGP, and AGP never proxy-executes a tool.

This validation is tracked as the open dogfood child of Epic 06; it is **not**
claimed complete by this spec.

## Validation

```bash
bun test src/sprites/claude-code/
agp run --sprite claude-code          # deterministic reference (gate-only)
AGP_CLAUDE_LIVE=1 agp run --sprite claude-code   # fails closed until the bridge lands
```
