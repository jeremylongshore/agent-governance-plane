---
title: ADR — Topology C: Model-Only Egress-Allowlist Sandbox (DESIGN; implementation operator/real-infra-validated)
date: 2026-06-22
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted (design only — implementation deferred)
bead: agp-3s4
---

# ADR — Topology C: Model-Only Egress-Allowlist Sandbox (Design)

## Status

Accepted as a **design** (CTO, 2026-06-22). This ADR records the architecture for
Topology C — the north-star fully-isolated live harness from `037-AT-ADR` D2. It
does **not** ship enforcement: a real egress-allowlist (proxy or netfilter) plus
its live preflight can only be validated against real containers + real network,
which is not available in CI / this environment. Shipping unvalidated isolation
would be **false isolation — strictly worse than Topology B's honest full egress**
(`020-AT-THRT`). So the design lands now; the implementation + validation is
deferred to real-infra work (`agp-3s4` stays deferred). No fabricated validation.

## Context

The live harness runs in a Docker container (`bun-claude-process.ts` /
`live-codex-process.ts`):

- **Topology A** (rejected): harness on the host — no isolation.
- **Topology B** (v0, shipped): network-enabled container, repo + gate socket
  mounted, **full egress** so the harness can reach the model API. Real FS/process
  isolation; the honest, documented limitation is unrestricted egress
  (`037-AT-ADR` D2, `020-AT-THRT`).
- **Topology C** (this design): Topology B, but the container's egress is
  **restricted to the model API only** — closing the data-exfiltration surface a
  compromised/curious harness otherwise has.

The existing Topology-B isolation preflight (`src/sandbox/docker/network-preflight.ts`,
`agp-4na.4`) is the pattern to extend: it does not *trust* a `--network` flag — it
**proves** the property with a real egress probe, with a pure verdict
(`classifyEgressProbe`) that is fail-closed (ambiguity ⇒ not isolated).

## Decision (design)

### 1. Enforcement: egress-allowlist proxy (recommended) vs netfilter

| Option | How | Pros | Cons |
|--------|-----|------|------|
| **A. Egress proxy (recommended)** | Container on an internal Docker network with NO default route; its only egress is an AGP-controlled forward proxy that allowlists the model API host(s). | Allowlist is a host list (readable, auditable); no in-container privileges; works with `--cap-drop ALL`; the proxy is a natural place to also *log* egress. | A proxy process to run + trust; TLS to the model must pass through (CONNECT tunneling). |
| B. In-container netfilter | `iptables`/`nftables` rules dropping all egress except the model API IPs. | No extra process. | Needs `NET_ADMIN` (fights `--cap-drop ALL`); model API IPs are dynamic (CDN) so IP allowlisting is brittle; rules are harder to audit. |

**Recommend Option A** (egress-allowlist proxy): it composes with the hardened
`--cap-drop ALL` container (no added capabilities), allowlists by *host* (stable,
unlike CDN IPs), and gives an egress audit point. Netfilter is rejected for v0-C
(capability + dynamic-IP friction).

### 2. The fail-closed allowlist preflight (the safety mechanism)

Mirror `network-preflight.ts`: Topology C MUST NOT be trusted on the proxy config
alone. Before a governed run, an in-container probe verifies the allowlist is
**actually** enforced, with a pure, unit-testable verdict:

- Probe a **non-model** endpoint (e.g. `example.com`) → it MUST be **blocked**
  (connection refused / no route / proxy-denied). If reachable ⇒ allowlist NOT
  enforced ⇒ **refuse to run** (fail closed).
- Probe the **model** endpoint → it MUST be **reachable** (else the harness can't
  work; surface a clear error).
- A `classifyAllowlistProbe(result)` pure function returns `enforced` only when
  non-model is demonstrably blocked AND model is reachable; any ambiguity ⇒ not
  enforced ⇒ refuse. Fail-closed by construction, exactly like
  `classifyEgressProbe`.

This is what makes Topology C safe even if the proxy config drifts: you cannot run
a "C" session unless the preflight proves egress is restricted.

### 3. What stays unchanged

Topology B remains the v0 default with its honest full-egress limitation. C is opt-in
(a future `AGP_SANDBOX_EGRESS=allowlist` style switch) and only engages once the
proxy + the passing preflight exist. The model-only egress claim is **not** made on
any public surface until C ships and its preflight validates it (claim-control).

## Why implementation is deferred (honest)

The enforcement (proxy wiring, the Docker internal-network plumbing) and the **live**
preflight probe require real containers + real network egress to validate — there is
no Docker/network in CI here, and an unvalidated allowlist that *looks* enforced is
the exact false-isolation footgun `020-AT-THRT` warns against. So `agp-3s4` is
deferred with this design as its blueprint; building it is real-infra work an
operator validates (the same class of constraint as the live Codex path,
`045-AT-ADR`).

## Consequences

- The architecture is captured + grounded in the existing preflight pattern, so the
  future build is a known quantity, not a fresh design.
- No code ships; no false-isolation risk; Topology B's honest limitation stands.
- No public claim changes.

## References

`037-AT-ADR` D2 (Topology C north star), `020-AT-THRT` (isolation limits),
`027-AT-SPEC` (the fully-isolated harness the design enables),
`src/sandbox/docker/network-preflight.ts` (`agp-4na.4`, the preflight pattern),
`045-AT-ADR` (the comparable operator-validated honest-limitation precedent). Bead:
`agp-3s4`.
