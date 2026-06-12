---
title: "Contract: GatewayMessage"
date: 2026-06-01
author: Jeremy Longshore
type: Contract (CONT)
stability: INTERNAL — unstable — no public RFC
epic: Epic 03 — core contracts (bead agp-nsd)
source: src/contracts/gateway-message.ts
---

# Contract: GatewayMessage

**INTERNAL — unstable — no public RFC.**

The internal protocol between a sandboxed intendant and the control plane. Every
tool call the agent attempts becomes a request the gateway mediates
(policy gate → optional HITL → journal) before a result flows back. A
discriminated union on `kind`.

## Variants

| `kind` | Direction | Key fields |
|--------|-----------|-----------|
| `tool_call_request` | intendant → gateway | `tool`, `args`, `actor` |
| `policy_verdict` | gateway → intendant | `verdict` ([PolicyVerdict](014-AT-CONT-policy-verdict.md)) |
| `tool_call_result` | gateway → intendant | `ok`, `output` |
| `error` | either | `message` (protocol error, not a tool's own failure) |

All variants carry `id` (correlates request ↔ verdict ↔ result) and `sessionId`.

## Invariants

- Discriminated strictly on `kind`; an unknown `kind` is rejected.
- A `tool_call_request` without a `tool` is rejected.

## Stability

INTERNAL and unstable. Breaking changes (new/removed variant, field changes)
require **a Bead + an ADR**.
