---
title: ADR — Intendants extraction readiness + the extraction plan
date: 2026-07-11
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted
epic: agp-eva — Build Intendants (governed background agents) as a composition plane over owned assets
implements: intent-os 030-AT-DECR D2 condition #5 ("extraction ADR carrying the bead↔GH↔Plane ID chain and per-component license posture")
decision: Fix HOW the composition plane extracts from AGP to jeremylongshore/intendants; record the 5-condition gate status; keep the three irreversible/public one-way doors human-gated
---

# ADR — Intendants extraction readiness + the extraction plan

> **Status: Accepted (2026-07-11).** This is condition #5 of the extraction gate
> in intent-os `030-AT-DECR` D2. It does **not** itself perform the extraction or
> authorize any public surface — it fixes the architecture, the ID chain, and the
> licenses so the mechanical move is a small reversible step, and it names the
> irreversible doors that remain Jeremy's explicit call.

## Context

`030-AT-DECR` (D2, unanimous) ruled the composition plane stays a flag-gated spike
inside `agent-governance-plane` (AGP) through Slice 0, and extracts to
`jeremylongshore/intendants` (a reserved **private** repo) only when **all five**
conditions are true — "an event, never a date." Slice 0 is built (`agp-eva.1.5`,
merged, live-dogfooded) and the notify-mode watcher is running on cron
(`agp-eva.1.7`). This ADR records readiness and fixes the extraction mechanics.

## The five-condition gate — status

| # | Condition (owner) | Status |
|---|---|---|
| 1 | Slice-0 green + reproducible: mediate → HITL → journal → verify (CSO) | ✅ live dogfood 2026-07-11 (real Docker + gh; issues #1–6 filed; journal verified) |
| 2 | Frozen cross-chain journal↔receipt contract (CTO) | ◑ the pointer substrate is frozen (`trigger.fired`/`trigger.settled` carry `correlationId` + knowledge-tip hash); the full GSB receipt swap is `agp-eva.1.2`, **not** required for extraction — the contract shape is fixed |
| 3 | npm scope reserved + signing trust root (CISO) | ✅ `@intentsolutions` scope owned; AGP Ed25519 journal signing shipped |
| 4 | One-command install on a clean machine (DevRel) | ✅ `scripts/install.sh` — idempotent, fail-closed, verified (bun→install→init→keygen→example spec→offline verify) |
| 5 | Extraction ADR with the ID chain + license posture (GC) | ✅ **this document** |

**Readiness: met.** Condition 2's residual (full GSB backend — GSB is the Governed
Second Brain, since 2026-07-10 productized as **Bob's Big Brain**: umbrella
`intent-solutions-io/bobs-big-brain-umbrella`, engines
`jeremylongshore/intentional-cognition-os` + `jeremylongshore/qmd-team-intent-kb`,
plugin `jeremylongshore/bobs-big-brain-plugin`) is post-extraction
work under `agp-eva.1.2`; the frozen contract it will implement already exists, so
it does not block the move.

## Decision — extraction architecture

The governance **kernel** stays in AGP; the composition **plane** moves.

- **AGP (stays):** `contracts/`, `daemon/`, `policy/`, `journal/`, `sandbox/`,
  `channels/`, `gateway/`, `verify/`, `tenants/`, `intendants/` (harness adapters).
  AGP remains the governance library — the thing that gates, sandboxes, and signs.
- **`jeremylongshore/intendants` (the new repo):** `triggers/` (the watcher +
  future sources), the `agp watch` operator surface, agent `templates/`, and
  `scripts/install.sh`. This is the "governed background agents" product.
- **Dependency direction:** intendants → AGP (leaf-on-kernel; never the reverse).
  intendants imports AGP's contracts + daemon.

**How intendants consumes AGP:** a **pinned git dependency** on an AGP release
tag — a literal tag (`github:jeremylongshore/agent-governance-plane#v0.1.95`) or a
`#semver:` range (`…#semver:0.1.x`) which Bun/npm resolve against real tags; a bare
`#v0.1.x` is NOT valid (it would be read as a literal branch/tag name). Not an
npm-published AGP package. Rationale — chose pinned-git over npm-publishing AGP
because publishing AGP as a library is a second, independent one-way door
(a public package API surface) that has no second consumer yet; this mirrors AGP's
own "shared-package end-state trigger-gated on a second consumer" (`040-AT-ADR`).
Revisit publishing `@intentsolutions/agp` when a second harness/consumer appears.

**Contract stability across the boundary:** the six frozen contracts +
`trigger-source` stay in AGP and are imported by intendants; a change to any of
them remains a Bead + ADR in AGP (unchanged rule). The leaf-layer invariant
(triggers must not import the daemon) is preserved — intendants depends on the
interface, and Greptile's cross-repo context (already wired to the CCSC substrate)
extends to this edge.

## The bead ↔ GitHub ↔ Plane ID chain

- **Epic:** `agp-eva` ↔ GH `jeremylongshore/agent-governance-plane#120` (Plane: unmapped v0).
- **Slice 0:** `agp-eva.1` ↔ GH `#121`.
- **Extraction bead (new):** `agp-eva.1.8` "Extract the composition plane to
  jeremylongshore/intendants (private) as a pinned-git consumer of AGP" — links to
  the private `jeremylongshore/intendants` repo once populated.
- Every mirrored via `bd-sync`; the intendants repo's first issue carries a
  `**Beads:**` line back to `agp-eva.1.8` (three-layer mirror rule).

## License posture (per component)

- AGP: **Apache-2.0** (unchanged) — intendants git-depends on it under Apache-2.0.
- intendants: **Apache-2.0** (same family as AGP + governed-second-brain).
- Future retrieval substrate (qmd, if wired later): MIT (upstream, @tobi).
- `NOTICE` in intendants attributes AGP; no partner names without written consent
  (GC red line, `030-AT-DECR`).

## Irreversible / public one-way doors — NOT authorized here

This ADR readies the move; it does **not** open any public surface. The following
each remain a distinct, explicit Jeremy decision:

1. **Flip `jeremylongshore/intendants` PUBLIC.** The extraction populates the
   **private** repo; going public is separate (`001-AT-DECR` "no public surface
   until defensible"; `030-AT-DECR` D2 gate + D3 dark-until-green).
2. **Publish any npm package** (`@intentsolutions/intendants` or `…/agp`) — a
   permanent public API surface; the scope is reserved, nothing is published.
3. **Fire the holstered Rhys Sullivan reply** — gated in `030-AT-DECR` D3 on
   Slice-0 acceptance **AND** one-command install verifying on a clean machine.
   Condition #4 is now met; the reply is armed, but firing it is Jeremy's call and
   is out of scope for this ADR.

## Consequences

- The mechanical extraction (`agp-eva.1.8`) is now a small, reversible step: create
  the intendants package, move `triggers/` + `agp watch` + `templates/` + install,
  wire the pinned-git AGP dep, run `/repo-dress` on the new repo, keep it **private**.
- AGP shrinks to the kernel; its CI, coverage floors, and frozen-contract rules are
  unchanged (triggers leave, the daemon/loop stays fully tested).
- Nothing public changes until Jeremy opens door #1/#2/#3 above.

## Revisit triggers

- Publish `@intentsolutions/agp` (door #2 for AGP): when a second consumer of the
  kernel exists (per `040-AT-ADR`).
- Public flip (door #1) + Rhys reply (door #3): Jeremy's explicit go, post-extraction.
- Full GSB receipt backend (condition #2 residual): `agp-eva.1.2`.
