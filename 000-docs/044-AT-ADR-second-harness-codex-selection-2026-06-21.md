---
title: ADR — Second Harness Selection (OpenAI Codex CLI) + Contract-Genericity Proof
date: 2026-06-21
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted
epic: agp-cln — Add the second harness through the IntendantAdapter contract (GitHub #15, Epic 12)
decision: Select Codex; prove IntendantAdapter genericity via a deterministic reference + a flag-gated live path; no harness-specific path in the gate
---

# ADR — Second Harness Selection + Contract-Genericity Proof

## Status

Accepted (CTO, 2026-06-21). Tracked as epic `agp-cln` (Epic 12). Builds on the
substrate reconciliation (`040-AT-ADR`) and intendant-identity provenance
(`043-AT-ADR`), both shipped. Supersedes the casual "set `actor: codex_process`"
sketch in the research note — see "The actor-enum collision" below.

## Context

The multi-harness commitment is a v0.1 unlock gated on one binding condition, not
a calendar slot: *"Second-sprite contract tests pass — NOT a calendar slot"*
(`001-AT-DECR`), and Cannon-3's adversarial review warned that "multi-harness
without a second sprite is just a slide" (`002-PP-PLAN`). `039-PP-ROAD` makes the
acceptance explicit: the multi-harness public claim unlocks *only after contract
tests pass*. So this epic must ship a REAL second adapter that drives the same
governance loop the Claude Code intendant drives — not a design doc, not a stub.

Established by reading the code: the contract is already factored for this. The
frozen `IntendantAdapter` (`src/contracts/intendant-adapter.ts`) is five methods
(`identity`, `start`, `onToolCall`, `deliver`, `stop`) with zero Claude-specific
fields. `RunnableIntendant` (`src/daemon/daemon.ts`) extends it with
`run(sessionId)`. The whole governance loop — `Daemon.gate()`, `runLive()`, the
policy engine, the signed journal, the Slack HITL channel — never names a harness;
`gate()` takes `(req: ToolCallRequest, intendant: IntendantAdapter)` with no
`if (claude)` branch anywhere. The Claude intendant reaches its harness only
through an injectable `ClaudeProcess` seam — exactly the pattern a second harness
copies.

The honest open question: there is no authoritative pre-tool-execution hook spec
for Codex the way Claude Code ships a measured `PreToolUse` hook (`037-AT-ADR` D4).
Two facts make this tractable. First, the contract that proves *genericity* is
internal — proven by a deterministic reference process driven through the real
gate, needing no Codex binary. Second, the live path is engineered exactly as the
Claude live path is: a flag-gated, off-CI seam whose interception mechanism is
measured against the real binary and recorded in its own ADR.

## Decision

### 1. The second harness is OpenAI Codex CLI

Why Codex over alternatives (Aider, OpenHands, Cursor CLI): it is the harness the
locked plan already names ("Claude Code first; Codex next"); it maximizes the
*distance* from Claude Code along the dimensions that exercise the contract (a
different vendor, a different tool-call event shape, an interception model that is
NOT a native blocking hook) — if the contract survives a harness that different,
genericity is genuinely proven; and the `ClaudeProcess` seam was designed so a
harness with a different concurrency/blocking model is absorbed at the seam, not
the contract.

A CodexIntendant must SUPPLY only: the five `IntendantAdapter` methods plus
`run()`; a `CodexProcess` seam that normalizes Codex's tool-event shape to
`{ callId, tool, args }` and maps allow/deny back to Codex's decision mechanism;
and an auth seam reusing the operator's own Codex credentials (AGP holds no API
key, exactly as with Claude). Everything else is reused unchanged.

### 2. Integration design — normalization at the adapter boundary, gate untouched

The only translation a second harness performs lives in exactly one place: the
adapter's `onToolCall`-emit path, where the native tool event becomes a
`ToolCallRequest`. After that point the request is a plain `ToolCallRequest` and
the gate cannot tell which harness produced it. That is the structural proof of
"no backdoor": the policy engine evaluates `{ tool, actor }`, the journal records
`gate.<effective>`, the verdict flows back through `deliver()` — none of it takes
a harness argument other than the `IntendantAdapter`. A new **contract conformance
test** drives BOTH intendants through the same `runLive` with the same policy and
asserts identical governance (verdicts, journal event kinds, fail-closed
default-deny, require→HITL→effective). When it passes for both, the multi-harness
claim is honest — there is no "if codex" in the daemon.

### The actor-enum collision (the one real frozen-contract constraint)

The `Actor` enum is FROZEN (`src/contracts/_common.ts`) as exactly
`["session_owner", "claude_process"]`; changing it is a breaking core-contract
change requiring a Bead + ADR, and adding `codex_process` mid-epic would fork the
policy surface (a per-harness rule variant — precisely the backdoor we forbid). So
at v0 the CodexIntendant sets `actor: "claude_process"` — misleadingly named but
semantically already "the agent process" (per the enum's own comment). All
harnesses are one actor class; genericity is preserved by NOT special-casing the
actor. The clean rename `claude_process` → harness-neutral `agent_process` is a
deliberate breaking change deferred to its own Bead + ADR; it must not be smuggled
into this epic.

### 3. Two concurrent sessions, one Slack channel, no echo loop

Concurrency is already handled by mechanisms the second harness inherits; the
epic's job is to PROVE they hold across two harnesses. Every `GatewayMessage`
carries `sessionId`, so two simultaneous sessions never cross-correlate. The Slack
channel binds each approval nonce to the exact `(messageId, sessionId)` and
consumes it one-time. The echo-loop risk (AGP's own bot message read back as an
approval) is already closed: the channel rejects any `isBot === true` actor AND a
bot rejection does not consume the nonce, so a peer bot / second session cannot
burn a still-valid human request. A new concurrent-session test asserts all of
this across two interleaved sessions.

### 4. v0 right-sizing — deterministic reference + AGP_CODEX_LIVE gated live path

Mirror the Claude pattern exactly:

- **Deterministic reference (ships first, runs in CI):** an `InMemoryCodexProcess`
  emitting a fixed script with real back-pressure, driving the real `gate()` loop
  with no Codex binary — the analogue of `InMemoryClaudeProcess`. This proves the
  contract is generic, deterministically and under coverage.
- **Live path (gated, off-CI):** a `LiveCodexProcess` spawning the real `codex`
  binary, gated behind `AGP_CODEX_LIVE=1`, failing closed without `--task`/`--repo`.
  **Honest limitation:** Codex's live interception is not a measured native
  blocking hook, and no Codex binary is available in CI / this environment — so the
  live interception model is **provisional and operator-validated**, recorded as
  such in its own ADR (the Codex analogue of `037-AT-ADR` D4) and witnessed off-CI
  by the operator before it is trusted. The deterministic reference is what gates
  CI; the live path is never CI-validated.

### 5. The claim stays locked until the tests pass

`scripts/claim-scan.sh` blocks multi-harness language on public surfaces, and
`MARKETING_CLAIMS.md` lists exactly one allowed v0 claim. The multi-harness claim
unlocks *only after* the contract conformance test (child 1) and the
concurrent-session test (child 3) are green — so the `MARKETING_CLAIMS` edit is the
LAST child, with the hash re-pin (`scripts/audit-harness init`) in the same commit.
This ADR makes no banned assurance claim.

## Consequences

- The contract is proven generic by construction, not assertion; the daemon, gate,
  journal, policy, and channel are reused unchanged; the multi-harness claim becomes
  defensible on the deterministic proof alone.
- Honest limitations: (a) Codex's live interception is unmeasured here, so the live
  path is provisional/operator-validated, not CI-gated; (b) both harnesses share the
  `claude_process` actor label at v0 (honest about the contract, reads oddly until
  the deferred `agent_process` rename); (c) live validation needs a Codex binary +
  credentials the operator supplies, identical to the Claude live constraint.

## Deferred (explicitly NOT in agp-cln v0)

- Renaming `Actor` `claude_process` → `agent_process` (breaking; own Bead + ADR).
- Per-harness policy variants or any harness-aware rule (forbidden — the backdoor).
- Codex on the network-isolated north-star sandbox (Topology C / `agp-3s4`, v0.3+).
- A public Gateway RFC / third-party intendant SDK (`029-AT-ADR` + `001-AT-DECR` Q5).
- Sigstore-signed Codex releases (`IntendantIdentity.uri` stays null at v0; v0.6).

## Decomposition

`agp-cln.1`–`.4`: (1) the CodexIntendant + deterministic reference + conformance
proof; (2) the flag-gated live path + provisional measurement ADR; (3) the
concurrent-session/echo-loop test; (4) the gated MARKETING_CLAIMS unlock + re-pin.

## References

`016-AT-CONT` (IntendantAdapter), `037-AT-ADR` (measured Claude hook + topology),
`001-AT-DECR` (multi-harness gating, Q5), `002-PP-PLAN` (Epic 12), `039-PP-ROAD`
(item #4), `018-AT-CONT` / `022-AT-ARCH` (channel/nonce isolation), `043-AT-ADR`
(identity). Bead: `agp-cln` (GitHub #15).
