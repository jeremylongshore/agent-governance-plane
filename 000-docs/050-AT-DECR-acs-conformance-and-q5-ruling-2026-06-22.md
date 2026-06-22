---
title: AT-DECR — ISEDC Council Ruling: ACS Conformance + the Q5 Narrow Revisit
date: 2026-06-22
acting_head_of_board: Claude (Acting Head of Board, designated by Jeremy Longshore 2026-06-22)
council_size: 7
decisions_logged: 4
status: Accepted (direction ratified; implementation gated + deferred)
bead: agp-ed4
session: ~/.claude/skills/exec-decision-council/sessions/2026-06-22-agp-acs-q5/session.jsonl
---

# AT-DECR — ISEDC Council Ruling: ACS Conformance + the Q5 Narrow Revisit

## Mission of this record

A durable, verbatim-preserving record of the ISEDC council session that adjudicated
`agp-ed4`: should AGP adopt Microsoft's open **Agent Control Specification (ACS)** at
its policy/`gate()` layer, and should the council revisit the **locked decision Q5**
(`001-AT-DECR`: no public RFC/spec at v0)? Future readers: this is why AGP conforms to
ACS the way it does, why Q5 was NOT reversed, and why the build was deferred.

## Why a council, not a single review

The decision had asymmetric failure modes: a public standards-conformance claim is a
first-impression brand + standards-body event (hard to unwind), it touches a Microsoft
trademark, and it appeared to require reversing a *locked* council decision. Single-
reviewer reasoning is insufficient for that asymmetry.

## Synthesis lenses (applied by every seat)

- **L1** Governance layer-map — AGP spans gate+audit; ACS is a gate-layer spec;
  Microsoft is commoditizing the policy-gate; AGP's moat is the signed-audit kernel.
- **L2** Honest-claims discipline — exactly one v0 public claim ("signed audit log of
  every tool call"); assurance terms banned; never outrun shipped primitives.
- **L3** Single-operator-v0 + composability — "slot into an existing open spec rather
  than author a rival"; Q5's intent was composability, not silence.
- **L4** Crypto moat — Ed25519 hash-chained, *offline-verifiable* (asymmetric) journal
  vs ACS's symmetric-HMAC audit; lead on verifiability, never inherit ACS's marketing.

## The questions

| # | Question | Why costly |
|---|----------|-----------|
| Q1 | Adopt ACS allow/warn/deny/escalate at `gate()`, or keep native + map at the boundary? | Touches the frozen verdict contract. |
| Q2 | ACS-conformant portable manifest now, or keep `policy.json` internal + defer? | A public manifest format is a long-lived integration contract; **import** is a new attack surface. |
| Q3 | **The Q5 revisit:** permit a PUBLIC "ACS-conformant" claim before v1? | Reverses(?) a locked decision; a public conformance claim is a first-impression brand/standards event. |
| Q4 | Engagement posture with Microsoft/ACS? | First-impression with a standards steward is permanent. |

## Council composition

CTO (durability) · GC (IP/mark-use/audit-trail) · CMO (positioning/authorship; the
historic Q5 lone dissenter) · CFO (sole-prop bandwidth/opportunity cost) · CSO
(standards realpolitik; authored Q5's sequencing) · CISO (supply-chain/threat;
claim-veto) · VP DevRel (developer signal/friction).

## Per-question record

### Q1 — Verdict vocabulary · vote 6–1 · **DECISION: native + boundary-map**

Keep AGP's native `allow/deny/require`; map to ACS `allow/warn/deny/escalate` at a
**frozen, version-pinned, hash-pinned boundary adapter** — never in the kernel.
Implement `warn` honestly (no silent allow-downgrade; CISO).

- CTO/GC/CMO/CFO/CISO/VP-DevRel: native + boundary map (kernel sovereign; dev-facing =
  AGP's own words; `escalate` = Slack-thread, not ACS quorum).
- **CSO (dissent, preserved):** adopt ACS verdicts *natively* at `gate()` —
  consume-before-author; an enum is cheap; pin the ACS version.
- Primary tension: CSO (standards fidelity) vs the rest (kernel sovereignty / dev clarity).

### Q2 — Portable manifest · split → **DECISION: EXPORT now, DEFER import behind signing**

Export an ACS-conformant manifest now (`policy.json` stays canonical/internal); **defer
import** until it is behind **Ed25519 manifest signing + lossless-or-refuse**; reserve
the manifest-signing schema slot now.

- CISO (the pivotal catch): an unsigned *imported* manifest is a **governance-bypass /
  confused-deputy primitive** at the gate chokepoint — export is safe, import is not.
- VP-DevRel: import is a real on-ramp ("bring your ACS policy") but must FAIL LOUD.
- CFO (dissent): defer *all* manifest work until a second user — export-only is the
  cheap compromise that answers this.
- CMO/CSO: fuller/sooner. CTO/GC: export-only, generated, not canonical.

### Q3 — THE Q5 REVISIT · vote **7–0 for (b)** · **DECISION: narrow, test-gated conformance claim; Q5 STANDS**

Permit a narrow, **version-pinned** claim — *"conforms to the ACS vX policy-verdict
profile"* — **gated on all four**: (1) passing conformance tests (build the suite if
Microsoft hasn't published one — CFO's hidden cost); (2) **GC mark-use/trademark
clearance** (MIT licenses the spec *text*, not the "ACS" *name*); (3) **CISO veto** —
zero assurance semantics, policy-layer-only, must not inherit ACS's "tamper-evident"
marketing, registered in `MARKETING_CLAIMS.md` under claim-scan; (4) publish the passing
test run (verify-it-yourself).

**Q5 is NOT reversed.** The CSO — who authored Q5's binding 4-phase sequencing — ruled
that Q5 governs *authoring a rival spec*; **conforming to an already-stable, published
spec is orthogonal to Q5, not a deviation.** So the lock stands; the conformance claim
is a different, permitted act. Nobody chose (a) silence [too timid now that Microsoft
shipped the spec] or (c) loud alignment [overstatement that torches trust].

- Unanimous on the option; constraints stacked from GC (mark-use), CISO (veto/scope),
  CFO (suite-build cost), CSO (orthogonality + version-pin), VP-DevRel (publish the run).
- CMO steel-manned down from (c) to (b): "silence cost us the category once (Q5);
  conformance is the second door back — win authorship of the *profile*, not the spec."

### Q4 — Engagement · vote 7–0 informal · **DECISION: informal community-temperature; example + upstream over declaration**

Informal community-temperature now (private maintainer channel + a working
verify-it-yourself conformance example); upstream contributions — including AGP's
**stronger asymmetric Ed25519 audit profile** as a security-leadership move (CISO) —
are opportunistic + **CLA-reviewed (GC)**; **no formal conformance declaration before
v1**. The signal developers feel is a working example, not a press declaration
(VP-DevRel).

## Council memos (cross-question themes, per seat)

- **CTO:** Consume the spec at the boundary; never let it into the kernel.
- **GC:** Sequence, not direction — the assertion never precedes the artifact (and the
  mark-use) that backs it.
- **CMO:** Silence already cost the category once; conformance is the second door back —
  but the public claim must point at the moat (the signed journal), not the bare gate.
- **CFO:** One user, no pull, finite hours — buy options, not obligations; price the
  hidden conformance-suite build before claiming.
- **CSO:** Conformance ≠ authoring; Q5 only bound the latter — conforming is *consistent*
  with the lock. Conform in code → private temperature → verify a real process → narrow
  claim → upstream the audit profile.
- **CISO:** Conformance touches the policy layer and nothing else; lead on verifiability
  (asymmetric journal), refuse ACS's louder adjectives; reserve signing slots now.
- **VP-DevRel:** Conformance is an on-ramp, not an identity. Trust is one pool — an
  overstated ACS claim torches the one allowed audit claim.

## Cross-cutting

- **Most costly to recover from:** Q3 ×6 (the public claim); Q2 ×1 (CISO — the
  import-manifest governance-bypass). Q3 therefore got the heaviest gating.
- **Adversarial integrity: PRESERVED.** CSO lone dissent on Q1; CMO pushed (c)→(b);
  CISO a different most-costly pick (Q2); real collisions on bandwidth (CFO vs CMO/CSO),
  mark-use (GC), and the import threat (CISO).
- **Novel options introduced:** GC (the "ACS" trademark is not MIT-licensed); CFO (the
  hidden conformance-suite build cost); CISO (manifest import = governance-bypass →
  export-only); CSO (the orthogonality ruling — Q5 need not be reversed); VP-DevRel
  (trust-is-one-pool; example-over-declaration).

## Acting Head of Board ruling

I **accept the council's recommendation on all four questions with the stacked minority
constraints**, and I add one operating directive:

> **Direction ratified; implementation gated AND deferred.** At single-operator v0
> there is no customer pull for ACS conformance (CFO). So the *decision* is made and
> recorded, but the *build* waits for a real trigger — a second user, an operator who
> already has ACS policies wanting to try AGP, or v0.6. When that trigger fires, the
> path is: boundary verdict-map (Q1, cheap/reversible) → ACS manifest **export** (Q2) +
> reserve the signing slot → build/borrow the conformance suite → GC mark-clearance →
> the narrow claim under CISO veto (Q3) → informal upstream of the asymmetric-audit
> profile (Q4). Q5 stays locked.

This honors every seat: it captures CMO's "don't cede the category" by committing to
conformance; CFO's "no spend without pull" by deferring the build; CISO's safety by
making export-only/signed-import and the claim-veto binding; GC's mark-clearance gate;
CSO's orthogonality (Q5 intact); and VP-DevRel's honest-claims discipline.

## Implementation directives (gated; file beads when the trigger fires)

1. Q1 — boundary verdict-map (frozen/version-pinned/hash-pinned) — *cheap; do on first ACS-consuming need.*
2. Q2 — ACS manifest **export** + reserve `manifest_signature`/provenance schema slot; **import deferred** behind Ed25519 signing + lossless-or-refuse.
3. Q3 — conformance suite (build if none) → GC mark-clearance → narrow version-pinned claim under CISO veto + `MARKETING_CLAIMS.md` registration → publish the passing run.
4. Q4 — informal maintainer temperature + a verify-it-yourself example; opportunistic, CLA-reviewed upstream of the asymmetric-audit profile; no formal declaration pre-v1.

## References

`001-AT-DECR` (locked Q1–Q5; Q5 sequencing), `031-AT-DECR` (the ACS-adoption ADR this
ratifies/scopes), `030-AA-LAND` (competitive landscape — ACS publication), `039-PP-ROAD`
(agp-ed4 as the P1 council decision), `MARKETING_CLAIMS.md` (claim-control). Reusable
pattern: `~/.claude/skills/exec-decision-council/`. Full deliberation + verbatim
structured positions: `session.jsonl` (see frontmatter).

— **Claude, Acting Head of Board** (designated by Jeremy Longshore, 2026-06-22)
