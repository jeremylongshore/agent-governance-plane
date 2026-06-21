---
title: ADR — CCSC Substrate Boundary Reconciliation (adapt-and-harden)
date: 2026-06-12
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Accepted
epic: Epic 02 — Extract the CCSC governance kernel into an AGP-compatible substrate boundary (bead agp-7ii)
supersedes: 009-AT-ADR Option-A *vendor* mechanism for v0 (keeps 009's Option-D end-state)
decision: Ratify the as-built reimplementation ("adapt-and-harden") as AGP's v0 substrate-consumption mechanism
---

# ADR — CCSC Substrate Boundary Reconciliation

> **Status: Accepted (CTO, 2026-06-12).** Closes the Epic 02 gap: `009-AT-ADR`
> accepted "Option A — vendor a pinned CCSC subset" and deferred the physical copy
> to Epic 04; Epic 04 shipped a **native reimplementation**, not a vendor copy.
> This ADR ratifies that as-built reality ("adapt-and-harden"), supersedes 009's
> *vendor mechanism* for v0, **retains 009's Option-D shared-package end-state**
> (trigger-gated on a second consumer), and assesses the security-relevant
> upstream drift `substrate/UPSTREAM.md` flagged.

## Context

`009-AT-ADR` (Accepted 2026-06-01) chose **Option A — vendor a pinned CCSC kernel
subset** into `substrate/ccsc/`, and deliberately deferred the physical copy to
Epic 04 ("copying ~5k LoC with no consumer now would just drift"). The boundary
contract — `substrate/UPSTREAM.md` (pin: CCSC `v0.10.0` / `023cab3`) and `NOTICE`
— was established up front.

When Epic 04 built the CLI/daemon, it did **not** vendor. The four primitives were
**reimplemented natively** in `src/`, each carrying an "Adapted from CCSC …"
provenance header and **hardened beyond the reference**:

| Primitive | AGP module | Provenance | Hardening over CCSC |
|-----------|-----------|------------|---------------------|
| Policy gate | `src/policy/engine.ts` | adapted from `policy.ts` | strictest-wins (deny > require > allow) vs CCSC first-match |
| Signed journal | `src/journal/journal.ts` + `src/runtime/crypto.ts` | adapted from `journal.ts` + `crypto.ts` | signed HEAD checkpoint detects truncation |
| Nonce-HITL | `src/channels/slack/nonce-store.ts` | aligned with `nonce-hitl.ts` | same one-shot invariant, AGP contract layer |
| Docker sandbox | `src/sandbox/docker/*` | AGP-original | no CCSC counterpart; `--cap-drop ALL`, no-new-privileges |

There are **zero imports** from any `substrate/ccsc/` path; `substrate/` holds only
`UPSTREAM.md`. So the as-built substrate mechanism is **reimplementation**, not
vendoring — a divergence from 009 that was never recorded.

### Why the implementation diverged (and why it was right)

The reasons are the same facts 009 measured, applied at code-writing time:

1. **CCSC has no kernel boundary to vendor cleanly.** It is an app (no `src/`, no
   `exports`, dense `./`-relative coupling — `server.ts` 3250 LoC pulls the web).
   Vendoring the "subset" would drag in app glue; a clean carve is real refactor
   work either way. Reimplementing the *primitive* against CCSC's documented
   semantics was cheaper than untangling its files.
2. **Reimplementation let AGP impose clean contracts.** `src/contracts/` defines
   typed, tested interfaces (`PolicyVerdict`, `JournalEvent`, `ChannelAdapter`,
   `SandboxProvider`, `IntendantAdapter`) that vendored app files would not have.
3. **It let AGP harden.** Strictest-wins policy, signed-HEAD journal — improvements
   that would be local edits to vendored code (which 009 forbade: "not edited
   in-place").
4. **No consumer needed the literal CCSC bytes.** 009's own deferral logic ("no
   consumer now would just drift") argues *against* a copy; reimplementation
   satisfies the same reproducibility goal without carrying ~5k LoC of upstream app.

## Decision

**Ratify the as-built reimplementation as AGP's v0 substrate-consumption
mechanism — "adapt-and-harden."** AGP composes CCSC by **independently
reimplementing** the kernel primitives from CCSC's documented design + source,
under AGP's own typed contracts, with provenance recorded per file and an upstream
pin + drift-review process in `substrate/UPSTREAM.md`.

This **supersedes `009-AT-ADR`'s Option-A *vendor* mechanism** for v0. It does
**not** change 009's other conclusions: Options B (submodule) and C (path dep)
stay rejected, and **Option D (shared `@intentsolutions/ccsc-kernel` package)
remains the end-state, trigger-gated on a real second consumer** — which is now
concretely the second harness (`agp-cln`, Epic 12). When a second consumer exists,
the reimplemented modules (clean contracts already in place) are the natural
contents of that package.

### What the substrate boundary IS, concretely

- **The contract interfaces** in `src/contracts/` — the typed, tested seam.
- **Per-module provenance headers** ("Adapted from CCSC …") — the audit trail of
  what derives from CCSC.
- **`substrate/UPSTREAM.md`** — the CCSC pin (`v0.10.0` / `023cab3`) and a
  **drift-review process** (below), replacing the now-moot "re-sync the vendored
  copy" procedure.
- **`NOTICE`** — Apache-2.0 attribution for the CCSC-derived design/code (the
  attribution obligation survives reimplementation; only the "vendored" wording is
  corrected).

### Upstream-drift process (replaces vendor re-sync)

Because AGP reimplemented rather than vendored, there is no automatic re-sync; drift
is tracked deliberately:

1. Periodically (and before each minor release) diff AGP's reimplemented primitives
   against CCSC `HEAD` for **security-relevant** changes.
2. Record findings in `substrate/UPSTREAM.md` "Upstream changes since pin".
3. For each material gap, file a bead + GitHub issue and decide adopt / decline
   with rationale. Bump the pin when AGP's reimplementation is brought level.

## Security-relevant drift assessment (this review)

`substrate/UPSTREAM.md` flags two CCSC hardening changes landed after the pin.
Assessed against AGP's as-built reality:

- **CCSC PR #216 — `SECRET_DECLARATIONS` + helpers.** AGP uses a different,
  arguably stronger model: secrets are `{{secret:NAME}}` placeholders resolved to
  real values **only post-gate at the exec boundary** (`src/sandbox/credentials.ts`,
  `daemon.ts:137`); the value never enters a `GatewayMessage` and the journal
  records secret **names** only, never values or stdout. AGP does not need CCSC's
  declaration table; its placeholder discipline covers the injected-secret case.
- **CCSC PR #217 — `assertNoSecretValues()` (fail-closed value-exfiltration
  guard).** **AGP has no equivalent.** AGP's `redactSecrets` (`credentials.ts:124`)
  is *silent masking*, wired at a **single site** — proxy-exec stdout → intendant
  (`daemon.ts:143`) — and the journal there records names + exit code, not stdout.
  Strong for the proxy-exec path, but there is a real gap on the **live /
  Topology-B path** (the primary v0 dogfood path): the harness's own tool args are
  journaled verbatim (`args = tool_input`, per `037-AT-ADR`). If the model inlines
  a credential value in a tool call (e.g. `Bash` with an inline token), that value
  lands in the **permanent signed journal**, with no fail-closed guard to stop it.

**Conclusion:** AGP's placeholder model is stronger than CCSC's for *injected*
secrets, but AGP lacks a fail-closed, universal value-exfiltration assertion at the
**journal-append and channel-emit boundaries**. This is defense-in-depth, not a v0
blocker (the proxy-exec data plane is clean by construction), but the signed-journal
exposure on the live path makes it worth doing. **Filed as a follow-on security
bead** (see References) and slated as the immediate next hardening item.

## Consequences

- **`NOTICE` corrected** to describe AGP's modules as independently reimplemented
  from / adapted from CCSC (Apache-2.0 derivative), not vendored. Attribution
  retained.
- **`substrate/UPSTREAM.md` reframed** from a vendor record to a
  reimplementation-provenance + pin + drift-review record. The pin stays meaningful
  (the commit AGP's reimplementation is level with for drift review).
- **`009-AT-ADR` stands as history**; its Option-A *vendor mechanism* is superseded
  for v0 by this ADR, its Option-D end-state is retained. (Per the doc-filing rule,
  009 is not edited; this ADR records the supersession.)
- **No new security claim**; only the v0-allowed claim is used on public surfaces.
- **Roadmap corrected** (`039-PP-ROAD`): the agp-7ii line now reflects
  reconciliation, not a deferred ADR.

## References

- `009-AT-ADR` (the superseded vendor decision + Option-D end-state).
- `substrate/UPSTREAM.md` (pin + drift-review), `NOTICE` (attribution).
- `034-AT-ARCH` (credential injection), `037-AT-ADR` (live-harness topology;
  `args = tool_input`), `002-PP-PLAN` (Epic 02 / Epic 12 trigger), `039-PP-ROAD`.
- CCSC `v0.10.0` / `023cab3`; PR #216, PR #217.
- Beads: `agp-7ii` (this epic); follow-on security guard bead linked from the epic.
