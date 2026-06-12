---
title: "ADR: Gateway transport is Unix-socket only at v0 (no network transport)"
date: 2026-06-03
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
epic: Epic 05 — internal Gateway protocol (bead agp-oqh)
status: Accepted
supersedes: none
---

# ADR: Gateway transport is Unix-socket only at v0

## Status

**Accepted.** Binding for v0. Revisit at v0.3 (see "Consequences").

## Context

The Gateway carries every tool call from a sandboxed intendant to the control
plane. The sandbox runs a potentially **prompt-injected agent** — it is, in the
threat model's words (`002-PP-PLAN` §2.2, TB2), a *confused-deputy factory*. A
compromised agent will try to forge Gateway calls that the operator's signing
key then endorses in the audit journal.

The tempting design — a network transport with a `SESSION_TOKEN` bearer
credential — has a **known, unfixed** weakness (Cannon-2 finding, `004-AR-CANN`):
a bearer token lifted by a prompt-injected agent is replayable by anything that
can reach the endpoint. Bearer tokens are not sender-constrained. Fixing this
needs sender-constrained credentials (DPoP or mTLS) and per-tenant keys, which
are scheduled for v0.3 alongside the KMS work — not available at v0.

## Decision

1. **The Gateway transport is a Unix domain socket only at v0.** Network
   transport is **forbidden**.
2. The confused-deputy / `SESSION_TOKEN`-as-bearer hazard is **punted via
   topology, not crypto**: a single-host Unix socket has no network surface, so
   there is nothing remote to forge a call to or replay a token against.
3. **No public RFC of the wire format at v0** (AT-DECR Q5 + the CSO 4-phase
   sequencing lock, `002-PP-PLAN` §3.2/§3.4). Publishing a format committed to a
   known-broken auth model would do lasting damage with the OpenSSF / in-toto /
   SLSA audiences. The format stays INTERNAL and is free to break through v0.5.
4. On top of the topology mitigation, the protocol is **fail-closed**: malformed
   frames, duplicate/replayed ids, missing verdicts, and dropped connections all
   resolve to denial, never to a silent allow (see
   [`028-AT-ARCH`](028-AT-ARCH-gateway-protocol.md)).

This is a **security invariant, not a feature gap.** The absence of a network
transport is the mitigation.

## Consequences

- v0 runs single-operator, single-host — which is exactly the v0 audience, so
  the Unix-socket constraint costs nothing real now.
- A network transport with sender-constrained tokens (DPoP / mTLS) + per-tenant
  KMS keys is the v0.3 unlock (`002-PP-PLAN` §4.2). The confused-deputy fix is
  **required before the transport leaves the Unix socket** — that requirement is
  the gate, enforced by this ADR.
- Enforcement: `grep -RE 'http.*gateway|gateway.*http' src/` must return zero
  results at v0. (This ADR file is named without that token for the same reason.)
