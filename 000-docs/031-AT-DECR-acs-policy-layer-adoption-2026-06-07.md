# 031 — Decision Record: Adopt Microsoft's Agent Control Specification at AGP's Policy Layer

## Status

**Proposed — pending ISEDC ratification.** Authored 2026-06-07 as a CTO recommendation.

This document recommends a change to a locked council decision. It does **not** enact one. **Q5 (protocol publication) remains locked** at its `001-AT-DECR` wording. The change recommended here requires ISEDC ratification by Jeremy and the council; the CTO recommends it forcefully but has no authority to unilaterally alter a locked decision. Until a council session ratifies a revision, the 4-phase RFC sequencing in `001-AT-DECR` Q5 is binding and unchanged.

## Context

In the roughly one week after AGP's master blueprint froze (`002-PP-PLAN`, dated 2026-05-27), Microsoft published the **Agent Control Specification (ACS)** — an open, MIT-licensed, vendor-neutral standard for runtime governance across the agent lifecycle, independent of framework, runtime, and policy engine. It shipped with a portable manifest and a reference implementation. The competitive-landscape audit (`030-AA-LAND`, 2026-06-04) documents this development and its strategic weight.

ACS is, precisely, the kind of portable runtime-governance specification AGP deliberately deferred authoring under Q5. The Q5 synthesis assumed a window in which no portable runtime-governance spec had yet been published, and sequenced AGP's own protocol work to ride community temperature through v0.7 before any public draft. As `030-AA-LAND` records, that premise is now false: ACS is that spec, it is from Microsoft, it is MIT-licensed, and it has a reference implementation.

ACS, as captured in `030-AA-LAND`, defines:

- **Eight lifecycle interception points**: `agent_startup`, `input`, `pre_model_call`, `post_model_call`, `pre_tool_call`, `post_tool_call`, `output`, `agent_shutdown`.
- **A policy mechanism**: Rego / OPA evaluated against a canonical snapshot.
- **Four verdict types**: allow, warn, deny, escalate.
- **A portable policy manifest** plus a reference implementation.

This decision record examines what AGP should do given that the spec it was sequencing toward authoring already exists in open form, and recommends that the council revisit Q5 in that light.

## Decision (recommended)

**AGP should profile and conform to ACS at its policy / gate layer rather than author a competing runtime-governance specification.** Concretely, the recommendation is:

1. **Map AGP's `gate()` to ACS's `pre_tool_call` interception point.** AGP's central control is the per-tool-call gate; ACS's `pre_tool_call` hook is the corresponding lifecycle point. Conforming AGP's gate to that interception contract makes AGP an ACS-conformant control point rather than a parallel invention.
2. **Adopt ACS verdict semantics** — allow, warn, deny, escalate — as AGP's verdict vocabulary where they fit AGP's existing policy-verdict contract (`014-AT-CONT`). AGP's Slack-native escalation is a concrete realization of ACS's `escalate` verdict.
3. **Adopt ACS's portable policy manifest** where its schema fits AGP's policy surfaces, so an operator's policy is expressed in a portable, non-AGP-proprietary form.
4. **Do not author a competing Gateway / runtime-governance specification.** The Gateway-only protocol-publication path contemplated under Q5's CTO compromise is superseded by conforming to ACS at the policy layer.

This is a profiling-and-conformance posture: AGP adopts ACS's policy-manifest schema and verdict semantics as its public policy contract, and contributes back where AGP's real-world needs (chat-native HITL, per-harness intendants) expose gaps, rather than publishing a rival spec.

## Why this de-risks Q5

The core anxiety in Q5 was category-authorship: the CMO's logged dissent framed a ceded category as potentially fatal, while the majority feared publishing a wire format with a known unfixed attack, or filing premature RFCs with zero adopters. Conforming to ACS dissolves the worst-case on both sides:

- **You cannot be "late to publish a spec" if you conform to an existing open one.** The race to author the portable runtime-governance category is already decided by a hyperscaler with distribution AGP cannot match. Trying to win it is the unwinnable fight; conforming to it removes the loss condition entirely.
- **Microsoft's distribution becomes a tailwind, not a threat.** Every team that adopts ACS becomes a team for whom AGP is a drop-in conformant control point. AGP's adoption surface grows with Microsoft's marketing spend rather than competing against it.
- **It honors the majority's caution without paying the CMO's feared cost.** The five-seat majority's "no RFCs at v0" concern was about premature, unbacked, attack-carrying publication. Conformance publishes nothing of AGP's own transport; it consumes someone else's stable schema. The CMO's "ceded category" fear is answered differently than Q5 imagined — the category is not ceded by silence, it is entered by conformance.

## Separation of concerns — adopting ACS does not expose AGP's transport

This is the load-bearing distinction for anyone worried that adopting ACS reopens the publication risk the council closed.

**ACS is a policy-manifest and verdict schema. It is not a transport specification.** Adopting ACS governs how policy is *expressed and evaluated* — the manifest format, the interception points, the verdict vocabulary. It says nothing about how AGP's components talk to each other on the wire.

AGP's transport remains the Unix-socket Gateway protocol decided in `029-AT-ADR`, and it **stays private and unpublished.** The CISO's dispositive Q5 concern — the bearer-credential confused-deputy weakness in the session-token handling at the Gateway protocol layer — lives entirely in transport, not in policy. Because ACS conformance touches only the policy layer, **adopting ACS exposes none of the transport surface that carries that concern.** The confused-deputy fix remains a prerequisite for any future transport publication, exactly as Q5 bound it; ACS adoption neither triggers nor relaxes that prerequisite.

In short: policy schema is public-by-conformance; transport stays internal. The two are decoupled, and the decoupling is what makes ACS adoption safe under the existing threat model.

## What stays defensible regardless

ACS conformance does **not** commoditize AGP's moat. The differentiators documented in `030-AA-LAND` survive intact:

- **The journal is the durable moat.** AGP's audit journal is a publicly and independently verifiable Ed25519 asymmetric signed and hash-chained record, with the public key published for offline verification and no shared secret required to verify (`src/config.ts`: `journal-ed25519.pub`). Microsoft's audit sink uses symmetric HMAC signing plus Merkle hash-chaining — verifying its log requires holding the shared secret. The honest, narrow, real distinction (per `030-AA-LAND`, lines 223–233) is **publicly and independently verifiable signatures**, not the false claim that Microsoft "does not sign." HMAC is symmetric; Ed25519 is asymmetric with a published verification key. A conformant policy layer changes none of this — the journal's verifiability is a property of AGP's signing architecture, not of its policy schema.
- **Chat-native HITL.** ACS has no Slack-native human-in-the-loop surface; its human path is generic approval workflows with quorum logic. AGP realizes ACS's `escalate` verdict as a real Slack thread.
- **The per-harness intendant adapter model.** ACS's agnosticism is spec-level; AGP's is an actual Claude-Code-intendant / Codex-intendant architecture (`016-AT-CONT`, `027-AT-SPEC`).
- **Single-operator self-host framing.** ACS is framed for multi-team enterprise compliance grading (EU AI Act, HIPAA, SOC2); AGP's v0 target is the single operator, consistent with Q1's OSS-first frame and the Q3 dogfooding persona.

Conforming to ACS at the policy layer makes AGP a better citizen of an open standard while leaving every one of these untouched.

Per Q4's marketing-claims discipline (`001-AT-DECR` Q4; `MARKETING_CLAIMS.md`, hash-pinned in the harness manifest), this document uses only the v0-allowed phrasing — **"signed audit log of every tool call"** — and asserts no stronger assurance term. ACS conformance does not unlock any additional claim; the allowlist still governs.

## Consequences and non-goals

**This does not change Q5 now.** It is a recommendation for ISEDC to revisit Q5 in light of ACS. Nothing in this document is in force until ratified.

What a council session convened to revisit Q5 would need to decide:

- **Whether to revise Q5** from "author no RFCs, sequence toward our own runtime-governance protocol via the 4-phase path" to "conform to and profile ACS at the policy layer; author no rival spec." This is the central question.
- **The disposition of the 4-phase RFC sequencing.** If AGP conforms to ACS at the policy layer, the informal community-temperature phase (v0.5 to v0.7) and the eventual RFC path would be re-scoped: from authoring a protocol to contributing AGP's gaps (chat-native HITL, intendant adapter model) back to ACS. The council should decide whether that re-scoping is the new binding commitment.
- **The status of the CMO's logged dissent.** The CMO's verbatim "ceded category authorship is permanent" position must be re-weighed against the new fact pattern: the category is now authored by Microsoft regardless of AGP's choice. The council should decide whether conformance satisfies, redirects, or overrides that dissent.
- **The transport boundary as an explicit ratified constraint.** The council should affirm that ACS adoption is policy-layer-only and that the Unix-socket Gateway transport stays unpublished, with the confused-deputy fix remaining a hard prerequisite for any future transport publication.
- **The Q1 / Q4 alignment check.** Confirm that ACS conformance is consistent with the OSS-first commercial frame (Q1) and does not tempt any drift toward the runtime-competitor or compliance-first frames explicitly excluded through v0.4, and that no Q4-banned assurance term enters public surfaces as a side effect of standards alignment.

**Non-goals of this recommendation:**

- It does not recommend publishing any AGP transport protocol.
- It does not recommend filing any RFC with a standards body at v0.
- It does not recommend any new public security claim beyond the v0 allowlist.
- It does not assert that AGP's moat depends on a proprietary policy schema — the moat is the verifiable journal, the chat-native HITL, and the intendant model, none of which conformance commoditizes.

## References

- `000-docs/001-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md` — locked council decisions; Q1 (commercial frame), Q4 (threat-model framing and claims-as-code), Q5 (protocol publication, the decision this document recommends revisiting).
- `000-docs/002-PP-PLAN-agp-master-blueprint-2026-05-27.md` — master blueprint that froze ~one week before ACS published.
- `000-docs/030-AA-LAND-competitive-landscape-2026-06-04.md` — competitive landscape; ACS facts, the honest Ed25519-versus-HMAC distinction, and the surviving AGP differentiators.
- `000-docs/029-AT-ADR-gateway-unix-socket-only.md` — the Unix-socket Gateway transport decision that stays private under this recommendation.
- Microsoft Agent Control Specification (ACS) — open, MIT-licensed runtime-governance spec; eight lifecycle interception points, Rego/OPA policy, allow/warn/deny/escalate verdicts, portable manifest, reference implementation. Published 2026-04-02. See [commandline.microsoft.com agent-control-specification](https://commandline.microsoft.com/agent-control-specification-runtime-governance).
