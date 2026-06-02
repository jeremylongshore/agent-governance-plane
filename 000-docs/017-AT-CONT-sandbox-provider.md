---
title: "Contract: SandboxProvider"
date: 2026-06-01
author: Jeremy Longshore
type: Contract (CONT)
stability: INTERNAL — unstable — no public RFC
epic: Epic 03 — core contracts (bead agp-nsd)
source: src/contracts/sandbox-provider.ts
---

# Contract: SandboxProvider

**INTERNAL — unstable — no public RFC.**

The contract for running a sprite inside an isolated execution environment. v0 is
Docker-based with **honest isolation limits** — a container is process +
filesystem isolation, not a VM/kernel boundary — and the contract surfaces those
limits rather than over-claiming.

## Interface

| Member | Signature | Purpose |
|--------|-----------|---------|
| `isolation` | `() => IsolationGuarantees` | honest statement of the boundary |
| `spawn` | `(SandboxSpec) => Promise<SandboxHandle>` | start an isolated sandbox |
| `exec` | `(handle, string[]) => Promise<ExecResult>` | run a command inside |
| `teardown` | `(handle) => Promise<void>` | destroy; idempotent |

## Invariants

- **Fail-closed networking:** `SandboxSpec.networkEnabled` defaults to `false`.
- **Honest isolation:** `IsolationGuarantees.vmGrade` is `false` for a plain
  container; the `boundary` string states what is and is NOT isolated. No caller
  or marketing claim may upgrade this (ties to Epic 11 claim-control).

## Stability

INTERNAL and unstable. Breaking changes require **a Bead + an ADR**.
