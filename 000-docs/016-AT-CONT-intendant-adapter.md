---
title: "Contract: IntendantAdapter"
date: 2026-06-01
author: Jeremy Longshore
type: Contract (CONT)
stability: INTERNAL — unstable — no public RFC
epic: Epic 03 — core contracts (bead agp-nsd)
source: src/contracts/intendant-adapter.ts
---

# Contract: IntendantAdapter

**INTERNAL — unstable — no public RFC.**

The contract a harness adapter implements so AGP can drive any agent harness
through one interface (Claude Code first; Codex next). The adapter surfaces the
harness's tool calls to the gateway and delivers verdicts/results back.

## Interface

| Member | Signature | Purpose |
|--------|-----------|---------|
| `identity` | `IntendantIdentity` | name + version (+ reserved `uri`) |
| `start` | `(sessionId) => Promise<void>` | begin a session |
| `onToolCall` | `(handler) => void` | gateway registers its tool-call receiver |
| `deliver` | `(GatewayMessage) => Promise<void>` | push a verdict/result to the intendant |
| `stop` | `() => Promise<void>` | tear down; idempotent |

`IntendantIdentity.uri` (Sigstore identity) is **reserved — null at v0** (intendant
identity ships at v0.6).

## Conformance

A reference fake implements the interface in the contract test and exercises
start → register-handler → stop. Any real adapter must pass the same shape.

## Stability

INTERNAL and unstable. Breaking changes (method signature/shape) require
**a Bead + an ADR**. Adding a second real adapter (Codex) must not weaken the
v0 security posture.
