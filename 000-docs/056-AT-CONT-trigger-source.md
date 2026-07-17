---
title: "Contract: TriggerSource"
date: 2026-07-09
author: Jeremy Longshore
type: Contract (CONT)
stability: INTERNAL — unstable — no public RFC
epic: agp-eva.1 — Slice 0 of Intendants, the governed-background-agents plane (bead agp-eva.1.1)
source: src/contracts/trigger-source.ts
authorized-by: 055-AT-ADR-build-vs-compose-and-trigger-source-contract.md
---

# Contract: TriggerSource

**INTERNAL — unstable — no public RFC.**

The contract for a source that **wakes a governed agent**. Every existing agent in the
estate (intentvision, perception, intent-mail's watch daemon) already lacks a common
trigger; `TriggerSource` is the one genuinely net-new AGP primitive for Slice 0 of
Intendants, the governed-background-agents plane (`054-PP-ROAD`; naming per intent-os
`030-AT-DECR`). A source emits `TriggerEvent`s; the daemon threads
each through `mediate()` (policy gate → HITL → signed journal → sandbox exec) exactly
like an intendant tool call. This is a **leaf**: it defines the port and its data shapes
only and MUST NOT import the daemon (the leaf-layer invariant Greptile enforces).

## Data shapes

| Schema | Purpose |
|--------|---------|
| `TriggerKind` | `cron` \| `webhook` \| `channel_event` \| `poll` \| `manual` |
| `TriggerEvent` | one firing — the unit that wakes a session |
| `TriggerSourceSpec` | a source's declaration (id, kind, enabled, liveness) |
| `TriggerHeartbeat` | a liveness sample the supervisor reads |

## Interface

| Member | Signature | Purpose |
|--------|-----------|---------|
| `spec` | `() => TriggerSourceSpec` | the source's declaration |
| `start` | `((TriggerEvent) => Promise<void>) => Promise<void>` | begin emitting via the daemon's admission callback |
| `stop` | `() => Promise<void>` | stop emitting; idempotent |
| `heartbeat` | `() => TriggerHeartbeat` | current liveness sample |

## Invariants

- **Cross-chain causal pointer:** `TriggerEvent.correlationId` is **required** (min 1).
  It is the shared id the AGP journal and the GSB receipt both carry, so "what did the
  agent know when it acted X?" stays answerable (`agp-eva.1.2`, Epic 8). GSB (Governed
  Second Brain — since 2026-07-10 productized as **Bob's Big Brain**: umbrella
  `intent-solutions-io/bobs-big-brain-umbrella`, engines
  `jeremylongshore/intentional-cognition-os` + `jeremylongshore/qmd-team-intent-kb`,
  plugin `jeremylongshore/bobs-big-brain-plugin`).
- **Liveness dead-man's-switch:** `TriggerSourceSpec.livenessTimeoutMs` (nullable) plus
  `heartbeat()` let a supervisor escalate a cadence-bearing source that goes silent
  (`agp-eva.1.3`, Epic 3). Null means "no cadence expectation" (a pure webhook) and is
  not watched.
- **Fail-closed:** `TriggerSourceSpec.enabled` defaults to `false` (a source is inert
  until turned on — the flag-gated spike posture); every schema is `.strict()`, so an
  unknown key makes a `TriggerEvent` malformed and it is rejected, never partially
  processed.
- **Dedup / suppression:** `TriggerEvent.dedupeKey` (nullable) lets the state layer
  (GSB / intentvision suppression windows) deliver "only NEW meaningful events" and
  satisfy the Slice-0 "same SHA twice → no re-alert" acceptance test.
- **Leaf layer:** no import of the daemon; the daemon depends on this interface, not the
  reverse.

## Stability

INTERNAL and unstable. Breaking changes require **a Bead + an ADR**. Authorized by
`055-AT-ADR`. Not part of the Epic-03 frozen barrel (`src/contracts/index.ts`); imported
by direct path, like the other post-Epic-03 additions (`session-lease`, `verifier`,
`intendant-manifest`, `outbox-delivery`).
