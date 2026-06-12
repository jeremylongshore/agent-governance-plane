---
title: "Architecture: Gateway Protocol"
date: 2026-06-03
author: Jeremy Longshore
type: Architecture (ARCH)
epic: Epic 05 — internal Gateway protocol (bead agp-oqh)
source: src/gateway/
stability: INTERNAL — unstable — will break through v0.5; no public RFC at v0
---

# Architecture: Gateway Protocol

The Gateway is the boundary between a **sandboxed intendant** and the **control
plane** — the one protocol the blueprint says is "worth taking seriously"
(`002-PP-PLAN` §1). Every tool call the agent attempts crosses it: request in,
policy verdict (or result) out. v0 carries `GatewayMessage`
([`015-AT-CONT`](015-AT-CONT-gateway-message.md)) over a **Unix domain socket
only** — network transport is forbidden at v0 (see
[`029-AT-ADR`](029-AT-ADR-gateway-unix-socket-only.md)).

## Topology

```
sandboxed intendant ──tool_call_request──▶ GatewayClient ═╗ (Unix socket)
                                                       ║
control plane (daemon.gate) ◀──────────── GatewayServer ╝
                  │
                  └── policy_verdict / error ──▶ (back over the same socket)
```

- **`GatewayClient`** (sandbox side): connects, sends a `tool_call_request`,
  awaits the response **correlated by message id**.
- **`GatewayServer`** (control-plane side): accepts connections, decodes framed
  requests, runs an injected `MediationHandler` (in practice `daemon.gate`),
  writes the correlated response.

## Framing

Newline-delimited JSON — one `GatewayMessage` per line. `FrameDecoder`
accumulates stream chunks and yields complete messages as newlines arrive.
Decoding is **strict**: `JSON.parse` then `GatewayMessage.parse` (zod). A frame
that is malformed, schema-invalid, or exceeds `MAX_FRAME_BYTES` (1 MiB) is
rejected — never partially processed.

## Correlation

Each `GatewayMessage` carries an `id`. The client keeps a pending-map keyed by
id; a response resolves the matching request. This makes interleaved /
out-of-order responses safe, and lets the client time out a single call without
disturbing others.

## Fail-closed states (the whole point)

| Event | Behaviour |
|-------|-----------|
| Malformed / oversize frame | server replies `error`, drops the link; client rejects in-flight |
| Non-`tool_call_request` to the server | rejected with `error` (server only accepts requests) |
| Duplicate / replayed request id | rejected with `error`; the handler does **not** re-run |
| Handler throws | `error` response — never a silent allow |
| Missing / late verdict | client rejects after `timeoutMs` (a missing verdict is never an allow) |
| Connection dropped mid-call (control-plane crash / sandbox teardown) | client rejects every in-flight request |

## Replay / duplicate guard

The server records every processed request id (server-wide, so a replay on a
fresh connection is also caught) and rejects a repeat. This is the v0 dedup
guarantee; it complements the topology mitigation in the ADR. (At v0, the id set
is bounded by the calls in a session — adequate for the single-operator model.)

## What v0 deliberately does NOT do

- No network transport, no bearer-token auth (ADR `029`).
- No public RFC — the wire format is INTERNAL and will break through v0.5.
- No exactly-once / durable replay across a control-plane restart — the signed
  journal is the durable record; session resumption is post-v0 (`agp-4na`).
