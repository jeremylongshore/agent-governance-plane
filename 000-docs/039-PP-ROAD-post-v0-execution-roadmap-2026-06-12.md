# 039 — Post-v0 Execution Roadmap

**Status:** Active (CTO sequencing decision, 2026-06-12). Execution-ordering doc — it
sequences already-approved work under the locked blueprint; it changes **no** locked
decision. Supersedes nothing in `001-AT-DECR` / `002-PP-PLAN`.

## Context

v0 shipped (**v0.1.59**). The 16-epic Phase B plan's v0 spine is complete: Epic 04
(`agp` CLI) → Epic 06 (Claude Code intendant, `agp-92v`, closed) → Epic 10 (signed
journal). Real Claude Code is governed end-to-end on the host and inside a `--cap-drop
ALL` container; signed journals verify offline; the deterministic governed-loop gates
every PR.

What remains is a backlog of P1–P3 beads with no agreed execution order. This doc
fixes that order, ties every item to its GitHub issue + blueprint epic + version-ladder
milestone, and records the one near-term **decision gate** (ACS/Q5) and its sequencing
impact. It is the answer to "from here, in what order, and why."

## bd ↔ GitHub mirror (reconciled 2026-06-12)

Two-way alignment restored this session: every open bead has a GitHub issue and every
open issue maps to a bead. Stale Epic-06 issue `#9` closed (it predated the
sprite→intendant rename, `038-AT-ADR`). Child beads live under their epic's issue (no
own issue), per the one-issue-per-cluster rule.

| Bead | GitHub | Blueprint epic | Priority |
|------|--------|----------------|----------|
| `agp-ed4` | `#83` | (cross-cutting; ADR `031`) | P1 — **decision gate** |
| `agp-7ii` | `#5` | Epic 02 — substrate boundary | P2 |
| `agp-4na` (epic) | `#52` | runtime hardening (peer-audit) | P2 |
| `agp-4na.2/.3/.5` | under `#52` | — | P2/P3 |
| `agp-z26` | `#16` | Epic 13 — intendant identity | P2 |
| `agp-cln` | `#15` | Epic 12 — second harness | P2 |
| `agp-pne` | `#17` | Epic 14 — multi-tenant prep | P2 |
| `agp-3s4` | `#84` | Topology C (`037-AT-ADR` D2) | P3 |
| `agp-0m3` | `#85` | dogfood perf | P3 |
| `agp-7r4` | `#86` | mutation tooling | P3 |
| `agp-92v` | `#9` (closed) | Epic 06 — DONE | — |

## The decision gate (resolve before, or design around)

**ACS/Q5 — `agp-ed4` / `#83` / ADR `031-AT-DECR`.** Microsoft published ACS (open, MIT,
vendor-neutral runtime-governance spec) after the blueprint froze — the spec AGP
deferred under locked **Q5** ("no public RFC/spec at v0"). The ADR recommends AGP
conform to ACS at the `gate()` layer (adopt the allow/warn/deny/escalate verdict set + a
portable policy manifest), keeping transport private.

Two things make this a gate, not a build:

1. **It is the council's call, not the CTO's.** Adopting ACS touches locked Q5, so it
   needs ISEDC ratification by Jeremy/council. The 5-page ratification brief was emailed
   2026-06-09; the session is parked on a date reply.
2. **It reshapes a contract that `agp-7ii` and the policy engine codify.** AGP's verdict
   type today is allow/require/deny; ACS is allow/warn/deny/escalate. Finalizing the
   substrate boundary (#2 below) *before* this gate risks redoing the verdict/manifest
   surface.

**Sequencing rule:** resolve the gate first if a council date lands soon; otherwise build
`agp-7ii` **ACS-ready** — make the verdict enum and policy-manifest shape extensible so
conforming later is additive, not a rewrite. Note the conformance is arguably *consistent*
with Q5's intent ("composability — slot into an existing open spec rather than author a
rival"); the revisit is narrow: may AGP publicly state ACS-conformance before v1.

## Execution order

Ordering principle: v0 is shipped, so spend next on what makes the foundation **durable
and extensible** before chasing **breadth**. Foundational/unblocking → production-real →
breadth → deferred.

### 1. CCSC substrate boundary — `agp-7ii` / `#5` (Epic 02) — RECONCILED (`040-AT-ADR`)

**Correction:** the substrate decision was *not* deferred. `009-AT-ADR` accepted
"Option A — vendor a pinned CCSC subset" (2026-06-01) but deferred the physical copy to
Epic 04; Epic 04 then shipped a **native reimplementation** ("adapt-and-harden"), not a
vendor copy. `040-AT-ADR` (2026-06-12) ratifies that as-built reality, supersedes 009's
vendor *mechanism* for v0, keeps 009's Option-D shared-package end-state (trigger-gated
on the second harness), corrects the `NOTICE`, and reframes `substrate/UPSTREAM.md` to a
pin + drift-review record. **A real security gap surfaced** in that review (see below)
and becomes the immediate next build item.

### 1b. Secret-value exfiltration guard — DONE (surfaced by `040-AT-ADR`)

A fail-closed guard (CCSC `assertNoSecretValues()` equivalent) wired at the
journal-append and channel-emit boundaries. AGP already keeps secret values out of
the journal and channel **by construction** (it records tool names + decisions +
secret names, never args/values/stdout) — the drift review confirmed this against
`daemon.ts` and corrected an earlier overstated "reaches the signed journal" claim.
The guard makes that invariant **fail-closed code** so a future change adding a
value-bearing field can't silently regress it (defense-in-depth, not an active-leak
fix). Shipped as its own security bead + GitHub issue.

### 2. Runtime hardening — `agp-4na.2`, `agp-4na.3` / under `#52`

**Why second.** Already in progress (child `.4`, network-none hardening, shipped v0.1.46).
A governance plane that loses session state on restart (`.2` durable daemon + session
lease + crash recovery) or drops channel deliveries (`.3` transactional outbox) is not
trustworthy, and durable execution is a precondition for any longer-running or
multi-harness future. Finish the started epic. `agp-4na.5` (converge channel/admin
nonce-HITL) is a P3 evaluation — defer within the epic.

### 3. Intendant identity + supply-chain — `agp-z26` / `#16` (Epic 13)

**Why third.** Council-bound: Sigstore-signed intendant releases + an identity registry
are **CISO non-negotiable by v0.6** (when 10+ users exist). Build it before the user base
arrives and before the second harness — a new intendant adapter is exactly the artifact
that needs identity + supply-chain verification, so this naturally precedes #4.

### 4. Second harness via the IntendantAdapter contract — `agp-cln` / `#15` (Epic 12)

**Why fourth.** Depends on a clean substrate boundary (#1) and intendant identity (#3).
The blueprint's warning is explicit: "multi-harness without a second sprite is just a
slide" — a real second intendant (Codex next) is the only honest validation of the
adapter contract. Gate the *start* on either a real non-Claude user need or a deliberate
decision to prove the contract; it is the biggest open "is this wanted at v0.1?" question
in the plan.

### 5. Multi-tenant isolation prep — `agp-pne` / `#17` (Epic 14)

**Why last of the P2s.** Locked single-tenant-v0 stands; hosted multi-tenant is a v0.3+
concern. Build only the *isolation prep* that does not enable unsafe hosted operation —
no hosted multi-tenant surface ships from this epic. Lowest urgency.

### P3 follow-ons (opportunistic, not blocking)

- **`agp-3s4` / `#84` — Topology C (model-only egress allowlist).** The north star;
  pairs naturally with sandbox work. Replaces Topology B's full egress with a model-only
  allowlist for a fully network-isolated harness.
- **`agp-0m3` / `#85` — dogfood performance.** Quick CI win: scope the witnessed
  real-Claude run so it finishes within budget on a 2-core runner. The per-PR
  deterministic gate is unaffected.
- **`agp-7r4` / `#86` — mutation testing.** Blocked on upstream (a Bun-compatible
  mutation runner); parked until one exists.

## Explicitly NOT being built (stays deferred / locked)

- **No public surface.** `agp.intentsolutions.io` is a reserved namespace, not a
  deployment target. Unlock requires Epics 03/05/09/10/11 defensibility, per blueprint.
- **No hosted multi-tenant** (single-tenant v0 locked; #5 is prep only).
- **No public RFCs** (Q5; 4-phase sequencing — informal through v0.5→v0.7, formal RFC at
  v1+). The ACS gate does not change this unless the council revisits Q5.
- **No new v0 security claims.** Only the v0-allowed claim ("signed audit log of every
  tool call") is used on public surfaces (`scripts/claim-scan.sh`).

## Version-ladder mapping

| Milestone | What lands | Items |
|-----------|-----------|-------|
| v0 (shipped) | Claude-only, single-tenant, Docker sandbox, Slack HITL, signed journal | Epics 04/06/10 — done |
| next (v0.x) | durable + extensible foundation | #1 substrate, #2 runtime hardening |
| v0.6 | Sigstore + identity (CISO non-negotiable) | #3 `agp-z26` |
| v0.5–v0.7 | multi-harness proof (if pursued) | #4 `agp-cln` |
| v0.3+ | multi-tenant, KMS, WebAuthn, RFC sequencing | #5 `agp-pne`, ACS/Q5 if ratified |

## References

`001-AT-DECR` (locked Q1–Q5; Q5 protocol publication, v0.6 Sigstore non-negotiable),
`002-PP-PLAN` (16-epic Phase B plan, version ladder), `031-AT-DECR` (ACS adoption ADR),
`037-AT-ADR` (live-harness topology; Topology C), `038-AT-ADR` (sprite→intendant rename).
Bead: `agp-441`.
