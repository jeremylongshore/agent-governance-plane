---
title: ADR — Build-vs-Compose for the Governed Agent OS + the trigger-source contract
date: 2026-07-09
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted
epic: agp-eva — Build the Governed Agent OS as a composition plane over owned assets, in vertical slices
implements: agp-eva.1.1 (add the trigger-source contract as the Slice 0 net-new entry point)
decision: Compose owned assets over rebuild; authorize a frozen trigger-source leaf contract as the first net-new AGP artifact
---

# ADR — Build-vs-Compose + the trigger-source contract

> **Status: Accepted (2026-07-09).** Implements `agp-eva.1.1` under epic `agp-eva`,
> Slice 0 (`agp-eva.1`). This is (a) the strategic Build-vs-Compose decision the
> roadmap `054-PP-ROAD` calls for and (b) the frozen-contract ADR that authorizes a
> new `src/contracts/` type — adding one requires a Bead + an ADR.

## Context

The Governed Agent OS (`054-PP-ROAD`) is built by **composing** subsystems the estate
already ships (AGP governance/runtime/audit, GSB memory, IEP·JRig eval, CCSC delivery)
rather than rebuilding them. An estate + GitHub-org sweep confirmed the hardest agents
(intentvision, perception, x-bug-triage) already run and share exactly one gap: **no
common trigger and no shared governance/eval/delivery spine.** That gap is the platform.

We need a decision on record for *each capability*: is it already in AGP/GSB/IEP, or is
it genuinely net-new? — so future sessions compose instead of re-deriving. And Slice 0
needs its first concrete net-new artifact, which must not muddy AGP's kernel.

## Decision

### 1. Compose, don't rebuild — the Build-vs-Compose map

For the Governed Agent OS, the generic "engineer spec" stack maps onto owned assets:

| Generic need | Owned asset | Verdict |
|---|---|---|
| Sandboxes (E2B/Daytona) | AGP Docker sandbox (fail-closed) · Waygate | **Compose** |
| Durable queue (Temporal/BullMQ) | notify-lib cron + AGP outbox + intent-mail watch-daemon | **Net-new (small)** — a unified scheduler is the one real gap |
| State store (Postgres) | GSB receipts · intent-mail cursors · NEXUS ledger | **Compose** |
| Rate-limit (Redis) | notify-lib debounce · intentvision suppression windows | **Compose** |
| Orchestrator (LangGraph) | AGP `mediate()` · perception ADK orchestrator | **Compose** |
| GitHub App | `@gwi/github-webhook` (HMAC-verified) | **Compose** |
| Slack bot | CCSC (Socket Mode governance substrate) | **Compose** |
| PostHog | Umami (self-hosted + MCP) | **Compose** |
| Vector store | qmd via GSB / NEXUS | **Compose** |
| Eval / confidence thresholds | JRig (binary criteria + Rollout-Safety) | **Compose** |
| Dashboard | Gastown Viewer · intent-eval-dashboard | **Compose** |
| Discord output | intent-mail NotificationManager | **Compose** |
| Agent templates / marketplace | claude-code-plugins + validators | **Compose (artifact) / build (market)** |
| Human approval gate | AGP Slack HITL | **Compose** |
| Signed audit logs | AGP journal · GSB/NEXUS/moat receipts | **Compose** |

**Genuinely net-new (small):** (1) a durable job queue / unified scheduler that wakes
the fleet on cron/webhook; (2) the composition glue binding trigger → governance → eval
→ delivery; (3) the agent-template + test-pack artifact. Everything else is
compose-and-wire.

### 2. The trigger-source contract is the Slice-0 net-new entry point

The scheduler gap begins with a **frozen leaf contract**, `src/contracts/trigger-source.ts`
(Zod schemas + a TS port), modeling a source that emits `TriggerEvent`s to wake a
governed intendant session, which the daemon threads through `mediate()` like any tool
call. Rationale for landing the contract *first* (before any concrete source or
`mediate()` wiring):

- **Kernel stays clean.** A leaf contract has no daemon import (the leaf-layer invariant
  Greptile enforces). The flag-gated spike and the `mediate()` wiring are follow-up
  beads; this ADR adds only the port + its data shapes.
- **Contract-first is AGP's established pattern.** `session-lease`, `verifier`,
  `intendant-manifest`, and `outbox-delivery` were all added post-Epic-03 the same way:
  a frozen leaf type gated by a Bead + an ADR, imported by direct path (not the Epic-03
  barrel `index.ts`, which stays the six frozen originals).
- **The three invariants are reserved from the first commit** so populating them later
  is not a breaking change: `TriggerEvent.correlationId` (cross-chain causal pointer),
  `TriggerSourceSpec.livenessTimeoutMs` + `heartbeat()` (dead-man's-switch), and
  fail-closed defaults (`enabled: false`, `.strict()` schemas).

### 3. Extraction boundary

The composition plane (trigger + glue) extracts to a new `governed-agents` repo once
Slice 0 is proven; AGP keeps only the governance kernel and this contract. This ADR is
the extract-point record: the contract lives in AGP because a trigger event enters the
governance loop, but the *sources* and *scheduler* are `governed-agents` concerns.

## Consequences

- A new frozen contract joins `src/contracts/` under the Bead-+-ADR rule; changing it
  later needs another Bead + ADR. Documented in `056-AT-CONT-trigger-source.md`.
- No runtime behavior changes yet — the daemon does not import the contract in this
  slice, so CI risk is limited to the new leaf + its tests.
- Future sessions have a durable answer to "build or compose this?" for each capability
  above, preventing re-derivation and accidental rebuilds of shipped subsystems.

## Guardrails

- **No public claims.** This is internal planning; the v0 claim-control rule
  (`scripts/claim-scan.sh`) is unchanged. Nothing here adds a security claim to a public
  surface.
- **Frozen-contract discipline.** The Epic-03 barrel stays the six originals; later
  additions (including `trigger-source`) are direct-path imports.
- **Fail-closed.** A trigger source is inert until explicitly enabled; a malformed
  `TriggerEvent` is rejected, never partially processed.
