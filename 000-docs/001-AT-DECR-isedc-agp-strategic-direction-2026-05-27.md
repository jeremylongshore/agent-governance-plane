---
title: ISEDC Council Decision Record — AGP Strategic Direction
date: 2026-05-27
acting_head_of_board: Claude (delegated by Jeremy Longshore on 2026-05-27)
council_size: 7
decisions_logged: 5
status: final
session_directory: ~/.claude/skills/exec-decision-council/sessions/2026-05-27-agp-strategic-direction/
synthesis_input: /tmp/agp-synthesis-v2.md (after cannon adversarial review of v1)
cannon_pre_phase: architect-reviewer + security-auditor + product-critic + market-analyst
reusable_pattern: ~/.claude/skills/exec-decision-council/SKILL.md
---

# ISEDC Council Decision Record — Agent Governance Plane (AGP) Strategic Direction

## Mission of this Decision Record

Establish the binding strategic frame, v0 scope, buyer focus, threat-model framing, and protocol-publication posture for the **Agent Governance Plane (AGP)** — a Slack-native, OSS-first governance plane for AI agents that lets teams run any harness in a sandboxed runtime with cryptographically signed audit logs and human-in-the-loop approval prompts.

The decision was preceded by a 4-agent adversarial **thinker cannon** (architect / security / product-critic / market-analyst) that pressure-tested an initial synthesis (`v1`) and produced a revised synthesis (`v2`) the council adjudicated. The council itself is the standard 7-seat ISEDC roster (CTO, GC, CMO, CFO, CSO, CISO, VP DevRel).

Acting head of board for this session: **Claude**, designated by Jeremy Longshore on 2026-05-27 ("I'm not in the mood to make any decisions. That's what you have the council for. Have a plan in place before you come back.").

## Decision authority (read this before treating any decision below as binding)

This record is structured so authority is explicit and recoverable. Three points to anchor on:

1. **Jeremy Longshore owns all decisions.** Every "council synthesis" below is a *recommendation* to Jeremy. Jeremy ratifies (or revises, or rejects) each one. Where this doc previously used phrasing like "the acting head of board hereby ratifies," read that as "the acting head of board recommends to Jeremy and Jeremy has indicated assent for the purpose of unblocking the next step of work" — not as a unilateral Claude-as-board-chair finality.

2. **ISEDC is an internal Intent Solutions adversarial decision-input process. It is NOT an external legal, security, compliance, or standards authority.** The Intent Solutions Executive Decision Council pattern (see `~/.claude/skills/exec-decision-council/SKILL.md`) is a 7-seat adversarial review modeled on a corporate executive council. It produces durable internal decision records with verbatim dissent preserved. It does not have, and does not represent, any external authority — not Anthropic, not Forrester, not a regulatory body, not a standards organization, not a court. Council outputs are internal locked positions for Intent Solutions / AGP work, not external attestations.

3. **Claude Code executes the decided work through Beads (`bd`) and never makes architectural calls autonomously.** Once Jeremy ratifies a decision, the work is filed as bead-tracked tasks (parent epics + child beads, each mirrored to a GitHub issue). Claude Code claims, implements, validates, and closes those beads with PR + commit + test evidence. Architectural deviations require either a new bead with an explicit ADR or a return to the council process — not a side-channel Claude judgement call.

The session below produced **five recommendations** the council adjudicated under Jeremy's standing delegation. They are treated as binding by current AGP planning work because Jeremy has ratified them in subsequent in-band exchanges; if Jeremy later requests re-deliberation on any item, the affected bead branch pauses until the council reconvenes.

## Why a council, not a single review

Five intertwined decisions, each with multi-month or multi-year recovery cost:

1. Commercial frame anchors the entire GTM and is hard to unwind once announced.
2. v0 scope sets the founder's opportunity-cost spend for a quarter.
3. Buyer focus shapes UX, support obligations, and contract surface.
4. Threat-model framing is a one-way door — overstating security creates FTC liability and burns crypto-primitive credibility permanently.
5. Protocol publication is irreversible (zero adopters shaping a published spec = fossilized regret).

Single-reviewer reasoning cannot weigh these adversarially. The ISEDC pattern surfaces dissent rather than collapsing to consensus.

## Synthesis lenses

1. **Time horizon** — v0 (week 1) / v0.1 (month 1-2) / v1 (month 6-9) / v2+
2. **Code-side vs market-side reality** — what we build vs who pays / why / how much
3. **Composability** — AGP slots into existing infra (Slack, GitHub, Docker, Anthropic API); never owns the whole stack
4. **Deployment arena** — solo dev / small team / enterprise / partner ecosystem

## The 5 questions adjudicated

| # | Question | Why immutable / costly |
|---|---|---|
| Q1 | AGP commercial frame: OSS-first + consulting · Compliance-first · Runtime competitor · Embed-in-Anthropic | Wrong frame = 6-12 months on the wrong GTM motion |
| Q2 | v0 scope: 1-week "Jeremy in truck" · 90-day full v0 · in between | Founder opportunity cost compounds; over-scoping kills the project |
| Q3 | Buyer focus for v0: Jeremy himself · small dev teams · compliance shops · platform eng mid-size | Each buyer expects different security posture + sales motion |
| Q4 | Threat model framing: honest · aspirational marketing · tiered | Overclaimed security = FTC liability + permanent credibility loss |
| Q5 | Public protocol publication: no RFCs at v0 · 3 RFCs at v0 · 1 protocol only · all "v0.1 breaking allowed" | Published specs without implementers = fossilized regret; ceded category = competitor wins authorship |

## Council composition

| Seat | Value system | Bias | Typical adversaries |
|---|---|---|---|
| CTO / Chief Architect | Technical durability · schema integrity · immutability | Deliberation > commit · empirical evidence > authorship | CMO, CSO (on speed-of-filing) |
| GC / General Counsel | IP protection · partner-consent compliance · audit-trail discipline | Written consent before partner reference · paper trail is sacrosanct | CMO (public case studies), CSO (RFCs citing partner work) |
| CMO / Industry-Standard Strategist | Positioning · narrative coherence · first-mover authorship | Visible > silent · ambitious > conservative | GC, CFO, CSO on tactics |
| CFO / Strategic Operator | Sole-prop bandwidth · customer-signal gating · opportunity cost | Defer until customer evidence justifies | CMO, CSO on premature standards work |
| CSO / Chief Standards Officer | OpenSSF / in-toto / SLSA / CNCF / SIG-GenAI realpolitik · RFC sequencing | Community-temperature precedes RFC filing · first-impression permanent | CMO (RFC-as-marketing-move) |
| CISO / Chief Information Security Officer | Supply-chain attestation · signing infrastructure · threat model | Reserve schema slots NOW · scoped subdomain > broad | CMO (threat-model underweighting), CTO (signing-slot priority) |
| VP DevRel / Head of OSS Community | Developer-audience signal · OSS contribution dynamics · friction-to-adopt | "Saturday-afternoon-developer-tries-the-thing" test · informal > formal | GC (case-study examples), CMO (enterprise-brand vs developer-natural) |

## Per-question record

### Q1 — Commercial frame

| Seat | Vote | Key argument |
|---|---|---|
| CTO | **a** OSS-first | "Only frame that survives the cannon's structural critiques. Other three are unfundable, unwinnable, or surrender the protocol surface." |
| GC | **a** OSS-first | "Apache 2.0 patent grant + partnership-path carve-out in CONTRIBUTING. Compliance-first requires SOC2 audit (6-12mo) before sales motion." |
| CMO | **a** OSS-first | "Build developer trust narrative; layer compliance messaging into hosted tier later. Lead with the *category*, not the tool." |
| CFO | **a** OSS-first | "Reuses Jeremy's actual distribution muscle. Avoids $30-80k SOC2 tax. Honest to truck-driver bandwidth." |
| CSO | **a** OSS-first | "Standards-body legitimacy is earned via OSS optics. OpenSSF crowd reads OSS optics inversely to corporate optics." |
| CISO | **a** OSS-first | "Scopes our threat-model claims to what v0 can actually back. Compliance pitch is the *output* of an honest security program, not a wedge before the program exists." |
| VP DevRel | **a** OSS-first | "Developer adoption is upstream of every other frame succeeding." |

**Vote tally**: (a) **7/7 UNANIMOUS** · (b) 0 · (c) 0 · (d) 0

**Council synthesis (recommended to Jeremy, ratified)**: **Q1 → (a) OSS-first + consulting/hosted layer.**

**Rationale**: Unanimous. Anthropic-partnership angle (Reframe 4) runs as parallel ecosystem motion, not commercial dependency. Compliance-first / Runtime-competitor explicitly excluded from v0 through v0.4 horizons. **License: Apache 2.0** (GC compromise: patent grant + community trust).

---

### Q2 — v0 scope

| Seat | Vote | Key argument |
|---|---|---|
| CTO | **c** 3-4 weeks | "Pure 1-week is a demo not a v0. Need gateway socket interface written as internal contract." |
| GC | **a** 1-week | "Honest scope = honest implied warranties. Smaller v0 = less liability surface." |
| CMO | **c** 45-60 days | "One-week is invisible — no launch event. Need coordinated drop with RFC + working demo." |
| CFO | **a** 1-week | "Opportunity cost $4k vs $36k+. 1-week is non-negotiable. Anything longer than 2 weeks triggers ROI review." |
| CSO | **a** 1-week | "OpenSSF maintainers respect small honest tool > big aspirational slide deck. They've seen 200 90-day v0s die in public." |
| CISO | **a** 1-week | "Smaller threat surface to defend at launch. Schema for tenant_id and signing_key_id must reserve slots NOW — that's free; retrofitting is not." |
| VP DevRel | **c** 2 weeks | "1-week core + 1-week onboarding. Saturday-afternoon-developer test fails without `agp init`, Slack app manifest, `agp doctor`, README quickstart." |

**Vote tally**: (a) **4** · (c) **3** · (b) 0

**Council synthesis (recommended to Jeremy, ratified)**: **Q2 → (c) 2-week v0 = 1-week core + 1-week onboarding glue.**

**Rationale**: The 4-3 split is real but the *substance* of disagreement is small. CFO/GC/CSO/CISO are protecting against the 90-day fantasy that v1 indulged. CTO/VP DevRel are protecting against a v0 nobody-but-Jeremy can install. The synthesis is: 1-week core (Docker sandbox + Slack thread + signed journal, all lifted from CCSC primitives) PLUS 1-week onboarding (`agp init`, Slack app manifest export, `agp doctor`, 5-min README quickstart). Total ~14 days. CFO's $4k → $8k opportunity-cost extension is defensible against the adoption gain.

**Binding minority constraint (CISO non-negotiable)**: schema slots reserved at first commit — `tenant_id`, `signing_key_id`, `approval_binding_type`, `sprite_identity_uri` all present in journal-event schema with null values at v0. **Locking these slots now is free; retrofitting later is impossible without forking the chain.**

**Binding minority constraint (CTO compromise)**: the Gateway-socket interface annotated `// SCHEMA — breaking change requires bd + ADR` in code, harness-hash pinned, contract test in place. Internal-contract discipline without public RFC commitment.

---

### Q3 — Buyer focus

| Seat | Vote | Key argument |
|---|---|---|
| CTO | **a** Jeremy | "Dogfooding generates real signal. Other buyers require sales motion / support story / multi-tenant rewrite." |
| GC | **a** Jeremy | "Single buyer = single liability surface. No DPA, no SOC2 audit clause." |
| CMO | **d** Platform-eng | "Bridge between bottoms-up adoption and CISO-buyer-year-2. Solo devs are sympathetic but no PO." |
| CFO | **a** Jeremy → b later | "Zero CAC for v0. Then small dev teams at v0.1. NEVER drift to compliance unless inbound demand pulls it." |
| CSO | **a** Jeremy + d later | "Standards-body adopters are platform-eng. SLSA was built for them. But not until v0.5+." |
| CISO | **a** Jeremy | "Single principal = trivial threat model. Buyer #2 is small-dev-team self-hosting their own VPS — NEVER compliance shops or platform-eng until WebAuthn + KMS + Sigstore ship." |
| VP DevRel | **a** Jeremy (build); **b** small teams (adoption) | "These are different roles. Jeremy is dogfooding persona; small teams are OSS community." |

**Vote tally**: (a) **6** · (d) **1** · (b) 0 · (c) 0

**Council synthesis (recommended to Jeremy, ratified)**: **Q3 → (a) Jeremy himself for the v0 build target; small dev teams as the natural adoption population at v0.1+.**

**Rationale**: Strong majority. CMO's lone push for platform-eng-mid-size as primary persona is binding-constrained — that lane stays empty until the hosted plan exists at v0.8. Compliance shops are explicitly off-limits until v1+ per CISO's "contract with the council" condition. The two-tier persona model (Jeremy = build target / dogfooding; small dev teams = adoption target / case studies) becomes the v0 marketing posture.

---

### Q4 — Threat model framing

| Seat | Vote | Key argument |
|---|---|---|
| CTO | **a** Honest | "This is the question I will not compromise on. Aspirational framing IS the failure mode CCSC's CLAUDE.md already documents. Tier-2 marketing becomes load-bearing in 6 months." |
| GC | **c** Tiered | "Tiered with explicit non-commitment language inoculates against FTC deceptive-practices review." |
| CMO | **c** Tiered | "ONE headline-grade security claim: 'tamper-evident audit log with cryptographic chain-of-custody' — provided CISO confirms we can defend it. Otherwise honest framing everywhere else." |
| CFO | **a** Honest | "Aspirational without backing = FTC + reputation cost. Honest framing limits TAM but eliminates risk." |
| CSO | **a** Honest (SLSA-pattern tiered presentation) | "Matches SLSA L1-L4 attestation-strength grading. Earns credibility currency we'll spend later." |
| CISO | **a** Honest (with tiered presentation gated on shipped primitives) | "Aspirational marketing is malpractice and FTC liability. MARKETING_CLAIMS.md as code, pre-commit hook fails on disallowed claims at version tag N. **Non-negotiable.**" |
| VP DevRel | **a** Honest | "Developer community will find the overclaim. One HN thread unpacks 'what Ed25519 actually proves' and credibility is gone for two years." |

**Vote tally**: (a) **5** · (c) **2** · (b) 0

**Council synthesis (recommended to Jeremy, ratified)**: **Q4 → (a) Honest threat model, presented in SLSA-pattern tier visibility, marketing-claims-as-code registry.**

**Rationale**: 5-2 vote with strong CISO non-negotiable. GC and CMO's "tiered" votes are accommodations for marketing visibility — but their underlying substance does not actually contradict the honest framing; they want a presentation format, not a softening. Synthesis: substance = honest (full stop); presentation = SLSA-style tier table (what v0 defends / what v0 explicitly does NOT defend / what each later vN unlocks).

**Binding minority constraint (CISO non-negotiable, accepted)**:

- A `MARKETING_CLAIMS.md` file lives in the repo, hash-pinned in the harness manifest.
- It lists allowed-at-version-N claims explicitly.
- Pre-commit hook fails on any release-notes / README / landing-page diff that adds a claim not in the registry for the current version tag.
- **Allowed at v0**: "signed audit log of every tool call." **Disallowed at v0**: "tamper-evident," "nonrepudiable," "compliance-grade," "tamper-proof," "forensic," "audit-grade."
- CISO has veto power over any marketing claim. CMO's "tamper-evident" headline waits until per-tenant KMS + journal-witness service ship at v0.3+.

**Binding minority constraint (CMO)**: a single bold-but-true headline claim is acceptable. Default v0 lead: "signed audit log of every tool call your agent makes." CISO approves this phrase as on-allowlist.

---

### Q5 — Protocol publication

| Seat | Vote | Key argument |
|---|---|---|
| CTO | **c** Gateway only | "One well-designed protocol > three rushed ones. Other two (Sprite-to-Channel, Sprite-to-Sandbox) not yet load-bearing." |
| GC | **a** No RFCs | "Published protocols become trademark surfaces. Filing 3 at v0 is permanent brand commitment with zero learning." |
| CMO | **b** 3 RFCs at v0 | "**LONE STRONG DISSENT, EXPLICIT REQUEST TO LOG.** Ceded category authorship is permanent. Cost of a regretted protocol is a breaking change. Cost of a ceded category is the company." |
| CFO | **a** No RFCs | "Each RFC = 2-4 weeks. 3 RFCs = 6-12 weeks of pure-loss tax with zero adopters." |
| CSO | **a** No RFCs (4-phase sequencing) | "Community-temperature ALWAYS precedes RFC filing. First-impression with maintainer is permanent." |
| CISO | **a** No RFCs | "Cannon-2 caught the SESSION_TOKEN-as-bearer confused-deputy attack at the Gateway protocol layer. Publishing committed wire format with known attack we haven't fixed." |
| VP DevRel | **a** No RFCs (with documented extension points) | "Internal interfaces with JSDoc inline contracts + one reference impl per interface + CONTRIBUTING.md section for sandbox/sprite implementers. Spec follows code." |

**Vote tally**: (a) **5** · (b) **1 (CMO lone strong dissent)** · (c) **1 (CTO)** · (d) 0

**Council synthesis (recommended to Jeremy, ratified)**: **Q5 → (a) No RFCs at v0, with CSO's 4-phase sequencing as binding commitment.**

**The 4-phase RFC sequencing (CSO-authored, council-adopted)**:

1. **v0 → v0.5**: Internal interfaces only. Every internal interface gets a top-of-file `// INTERNAL — will break — see roadmap.md for RFC trigger` header. README explicitly states "protocols intentionally unstable until 3+ external implementations exist."
2. **v0.5 → v0.7 (months ~6-9)**: **Informal community-temperature phase.** Private emails / Slack DMs / hallway-track conversations with named maintainers in in-toto, SLSA, OpenSSF SCS WG, and OTel SIG-GenAI. "Here's what we built, here's the primitive — does this overlap your concerns?" **No GitHub issue. No published draft. No tweet.**
3. **v0.7**: If — and only if — 2+ maintainers in step 2 say "interesting, share a draft" → publish "RFC draft for comment" in our own repo, labeled "v0.1 — breaking changes allowed," cross-link from a single low-key post on the relevant WG mailing list. Tone: "we're looking for design review, not adoption."
4. **v1+**: Formal RFC submission to relevant standards body. Only after our own implementation is stable and ≥1 external implementation exists.

**Rationale**: 5/7 vote with a lone strong CMO dissent. The dissent is logged verbatim above per CMO's explicit request. The cannon-2 finding (SESSION_TOKEN bearer-credential confused-deputy attack) is dispositive: we cannot publish a Gateway protocol RFC committing to a wire format that has a known unfixed attack. CTO's compromise (Gateway-only) is folded into the v0.5-v0.7 informal-temperature phase — the Gateway protocol IS the first one we'd quietly share with maintainers, but not as a published RFC.

**Binding minority constraint (CMO)**: a "design notes" doc in our own repo at v0 (clearly labeled as internal-design-thinking, NOT a spec, NOT versioned, NOT inviting adoption) gives CMO the authorship signal without violating CSO's sequencing.

**Binding minority constraint (CTO)**: the Gateway-socket interface (sandbox ↔ control plane) must fix the SESSION_TOKEN bearer-credential problem BEFORE any RFC is published. v0 uses Unix-socket topology (sender-bound to single host); HTTP variant requires sender-constrained tokens (DPoP / mTLS) before going public.

**Binding minority constraint (VP DevRel)**: a `CONTRIBUTING.md` section for external implementers — "Want to write a sandbox provider / sprite / channel adapter? Here's the TypeScript interface with JSDoc contract, here's the reference impl, here's the test fixture. Expect breakage until v0.7 — pin to a commit SHA if you're shipping."

## Council memos (cross-question themes)

| Seat | Cross-question theme |
|---|---|
| CTO | "Deliberation-cost vs first-mover-cost. CMO/CFO push compression; CISO/GC/CTO push durability. v2 has right instincts but slightly over-corrects toward 1-week demo with no durable schema. Right answer: 3-4 week middle path that writes gateway protocol as internal contract." |
| GC | "Honest framing + deferred commercialization. v2 is legally defensible. Trades short-term feature completeness for long-term legal defensibility." |
| CMO | "**Authorship is the asset.** Every conservative vote across the 5 questions abandons the tagline. We can absorb conservatism on 1-2 questions; we cannot absorb it on all 5. Q5 is the one I will not stop arguing about." |
| CFO | "Jeremy's opportunity cost is the binding constraint. Every day spent on AGP is 8 hours not spent on searchcarriers/hustle/DiagnosticPro. Push back hard on anything that costs >2 weeks of Jeremy-time without a clear revenue connection." |
| CSO | "AGP earns standards-body legitimacy by being small, honest, and disciplined about sequencing — NOT by being ambitious, polished, or early-to-publish. OpenSSF/SLSA/in-toto/OTel SIG-GenAI audience reads OSS optics inversely to corporate optics." |
| CISO | "The right size of v0 is the size where threat-model claims match primitives. Every 'make v0 bigger' pressure creates a gap between what we claim and what we can defend. That gap is where FTC complaints, security-disclosure embarrassments, and 'this signed log proved nothing' post-mortems live." |
| VP DevRel | "OSS community is the gate. Every question's right answer is the one that lets a developer try AGP on a Saturday afternoon and either succeed, or understand why they failed and file a useful issue." |

## Cross-cutting themes

### Most-costly-to-recover-from tally

| Question | Seats naming it most costly |
|---|---|
| **Q4 (threat model framing)** | CTO, CISO, VP DevRel — 3 seats |
| **Q5 (protocol publication)** | GC, CMO, CSO — 3 seats |
| Q2 (v0 scope) | CFO — 1 seat |

**Q4 and Q5 tied for most-costly.** These are the load-bearing decisions and were deliberated slowest. The acting head's calls on both go with the majority + binding constraints stacked from the dissent.

### Adversarial integrity check

- ✅ CMO carried lone strong dissent on Q5 (explicit request to log prominently) — adversarial integrity preserved.
- ✅ CMO dissented on Q3 (platform-eng) and partially on Q4 (tiered framing) — three issues across 5 questions, the right level of adversarial energy.
- ✅ Q2 split 4-3 between strict 1-week and middle-path — genuine architectural tension surfaced and resolved at 2-week synthesis.
- ✅ CTO introduced novel constraint at Q5 not in the original framing (Gateway-only, the sandbox-↔-control-plane boundary as the one durable interface).
- ✅ CISO introduced multiple novel binding constraints (schema-slot reservation, MARKETING_CLAIMS.md as code, sprite identity by v0.6, scoped subdomain) — all accepted.

### How synthesis lenses landed

- **Time horizon** — Used heavily. Every decision distinguishes v0 / v0.1 / v0.7 / v1 horizons explicitly.
- **Code-side vs market-side reality** — Surfaced through CFO and CMO tension; resolved by making v0 a code-side investment with explicit market-side deferral to v0.1+.
- **Composability** — Most influential on Q5 (no protocols at v0 = AGP slots in rather than tries to standardize).
- **Deployment arena** — Most influential on Q3 (single buyer = Jeremy = solo arena, defers team/enterprise/ecosystem).

## Final decisions (council synthesis recommended to Jeremy; ratified in-band)

| # | Question | Decision | Vote | Rationale |
|---|---|---|---|---|
| Q1 | Commercial frame | **(a) OSS-first + consulting/hosted** · Apache 2.0 · Anthropic-partnership angle as parallel ecosystem motion | UNANIMOUS 7/7 | No dissent; locked. |
| Q2 | v0 scope | **(c) 2-week v0** = 1-week core + 1-week onboarding · CISO schema-slot reservation locked · CTO Gateway-interface annotation locked | 4-3 split, synthesized at 2 weeks | Reconciles strict-1-week purists with onboarding-needed advocates without 90-day fantasy. |
| Q3 | Buyer focus | **(a) Jeremy himself for build** · small dev teams as natural adoption target at v0.1+ · platform-eng deferred to v0.8 · compliance shops deferred to v1+ | 6-1 strong majority | CMO platform-eng push deferred, not rejected. |
| Q4 | Threat model | **(a) Honest** presented in SLSA-pattern tier visibility · MARKETING_CLAIMS.md as code with CISO veto · allowed v0 claim: "signed audit log of every tool call" | 5-2 (2 GC/CMO for tiered presentation) | Substance = honest; presentation = tiered with explicit gates. |
| Q5 | Protocol publication | **(a) No RFCs at v0** · CSO 4-phase sequencing binding · CMO design-notes doc compromise · CTO Gateway-fix-before-publish constraint · VP DevRel CONTRIBUTING.md extension section | 5-1-1 (CMO lone strong dissent for 3 RFCs; CTO Gateway-only) | CMO dissent logged verbatim per explicit request. |

## Implementation directives

| Directive | Owner | Phase | Trigger |
|---|---|---|---|
| Create `agp` project skeleton at `~/000-projects/agent-governance-plane/` | Jeremy | v0 day 1 | Council ratification |
| Scaffold `agp` CLI binary (Bun/TS); wire to CCSC primitives via direct import (monorepo refs, extract to lib later) | Jeremy | v0 day 1-2 | Skeleton complete |
| Docker sandbox spawn + Slack thread UI + Block Kit relay (lifted from CCSC) | Jeremy | v0 day 3-5 | CLI scaffold complete |
| Signed journal events with reserved schema slots (`tenant_id`, `signing_key_id`, `approval_binding_type`, `sprite_identity_uri` all null at v0) — **CISO non-negotiable** | Jeremy | v0 day 6-7 | Sandbox + Slack flow working |
| `agp init` interactive setup, Slack app manifest export, `agp doctor` health check, README quickstart | Jeremy | v0 week 2 | Core flow working |
| `MARKETING_CLAIMS.md` (hash-pinned), `THREAT-MODEL.md` (what-v0-defends/what-v0-doesn't table), `CONTRIBUTING.md` (external-implementer section) — **CISO non-negotiable** | Jeremy | v0 week 2 | Before public commit |
| Register `agp.intentsolutions.io` subdomain via Caddy on the VPS — **CISO scoped-subdomain requirement** | Jeremy | v0 week 2 | Before public landing page |
| Apache 2.0 license, CODE_OF_CONDUCT, SECURITY.md | Jeremy | v0 week 2 | Before public commit |
| Hold HN post until ALL of the above land. Posting tone: low-key, "Slack-side approval prompts for Claude Code with a signed log" — NOT "we built the agent governance plane" | Jeremy | end of v0 | All directives green |
| 4-phase RFC sequencing begins at v0.5 | Jeremy + CSO | v0.5 | 4-6 months post-v0 |
| WebAuthn / passkey approval binding | Jeremy | v0.4 | First security audit conversation |
| Per-tenant signing keys (KMS) + multi-tenant `gate()` rewrite | Jeremy | v0.1 | Second self-hoster asks |
| Sigstore-signed sprite releases + sprite-identity registry — **CISO non-negotiable by v0.6** | Jeremy | v0.6 | When 10+ users exist |

## Reusable pattern reference

This council session was conducted under the **Intent Solutions Executive Decision Council (ISEDC)** pattern v1.0.0, defined in `~/.claude/skills/exec-decision-council/SKILL.md`. Full per-seat verbatim positions are preserved in `~/.claude/skills/exec-decision-council/sessions/2026-05-27-agp-strategic-direction/session.jsonl`.

## Council facilitation record (acting-head role)

I, **Claude**, acting in the capacity of **session-level head of board for the Intent Solutions Executive Decision Council session of 2026-05-27** by explicit delegation of authority from Jeremy Longshore ("I'm not in the mood to make any decisions. That's what you have the council for. Please autonomously figure this out and have a plan in place before you come back."), weighed all seven seat positions, recorded majority decisions with stacked binding minority constraints, and **forward the five recommendations above to Jeremy for ratification**.

Per the "Decision authority" section at the top of this document: Jeremy owns the decisions; Claude facilitated the synthesis. Jeremy has subsequently ratified all five recommendations in-band and they are now treated as binding by AGP planning work. ISEDC is an internal Intent Solutions process, not an external authority. Implementation is owned by Jeremy and tracked via beads (`bd`) with GitHub-issue mirror; re-deliberation on any item requires a new council session called by Jeremy.

— Claude, session-level facilitator (acting-head role) · 2026-05-27

## Addendum: Timing Amendment (2026-05-27, post-market-landscape research)

### Trigger

Approximately two hours after the council session adjourned, a market-landscape research pass was conducted on the "Agent Control Plane" / agent-governance category. That research surfaced category-emergence dynamics the cannon-4 (market analyst) did not have access to during deliberation. Specifically:

1. **Forrester announced "Agent Control Plane" as a formal market category in December 2025** (see [Announcing Our Evaluation of the Agent Control Plane Market](https://www.forrester.com/blogs/announcing-our-evaluation-of-the-agent-control-plane-market/)). 79% of surveyed vendors recognize the category; 40% report active RFPs already in flight. The **formal Forrester Landscape report lands April 2026** — vendors named in that report receive multi-year analyst-relations gravity; vendors NOT named are functionally invisible to enterprise procurement for 12–18 months.

2. **Slack shipped "Block Kit for AI Agents" in May 2026** (see [slack.dev/build-richer-agent-experiences-with-block-kit](https://slack.dev/build-richer-agent-experiences-with-block-kit/)). Salesforce reports **300% growth in Slack-resident AI agents Jan–Apr 2026**. The Slack-as-agent-channel surface is uncrowded but actively hot.

3. **Closest competitors hold 3-of-4 of AGP's defining properties; none hold all 4**. The four AGP differentiating properties are: (a) sandboxed runtime, (b) multi-harness sprite slot, (c) Slack-native HITL, (d) cryptographically signed audit chain. Mapped against the field:

   | Competitor | Sandbox | Multi-harness | Slack HITL | Signed audit | Holds all 4? |
   |---|---|---|---|---|---|
   | Credal | ✅ | ❌ (single harness) | ✅ | ✅ | No |
   | Speakeasy | ✅ | ✅ | ❌ (web UI) | ✅ | No |
   | OpenHands | ✅ | ✅ | ❌ (CLI / web) | ❌ | No |
   | E2B | ✅ | ✅ | ❌ | ❌ | No |
   | Browser Use | ✅ | ❌ (browser only) | ❌ | ❌ | No |
   | Signet | ❌ (no sandbox) | n/a | ❌ | ✅ | No |
   | Anthropic AgentCore | ✅ | ❌ (Claude only) | ❌ | ⚠️ (closed) | No |

   This is the open-window finding: a **6-week competitive window** before well-funded incumbents notice and ship the missing fourth property.

### Amendment (single decision modification, no re-deliberation)

> **Phase B controlling change (supersedes this amendment).** The Phase A timing amendment below proposed a 6-week-to-credible-demo cadence calibrated against the Forrester April 2026 reporting window, with v0.2 = hosted demo. **Phase B (2026-05-27 → present) rejects the amendment's calendar entirely.** The substance of the five locked Q1–Q5 decisions remains in force; the cadence is no longer paced by analyst-relations deadlines. The version-ladder semantics are normalized to the table below the dividing line. The original revised-cadence table is preserved as historical record only.

**Phase B normalized version ladder** (this is the authoritative ladder; supersedes the Phase A revised-cadence table):

| Version | Scope | Trigger |
|---|---|---|
| v0 | 1-week core + 1-week onboarding equivalent of effort (per Q2) — Claude-only, single-tenant, Docker sandbox, Slack channel, signed local journal | 16-epic Phase B plan completes Epic 04 (CLI) → Epic 06 (Claude sprite) → Epic 10 (signed journal) |
| v0.1 | Add second harness through the SpriteAdapter contract (Phase B Epic 12) | Second-sprite contract tests pass — NOT a calendar slot |
| v0.2 | Optional internal-readiness milestone (NOT a hosted demo) | May be skipped; if used, operator-only on tailnet, no public surface |
| v0.3 | Multi-tenant + per-tenant KMS + HTTP Gateway with sender-constrained auth | Second self-hoster asks |
| v0.4 | WebAuthn / passkey approval-binding | First security audit conversation |
| v0.6 | Sigstore-signed sprite releases + sprite identity registry | 10+ users exist — **CISO non-negotiable by v0.6** |
| v0.8 | Hosted plan for self-hosters who don't want to operate (canonical first public-surface checkpoint) | 5 self-hosters ask |

<details>
<summary>Original Phase A "revised cadence" table (HISTORICAL — superseded by Phase B; do NOT treat as canonical)</summary>

The Phase A amendment originally said: *"The **deferred backlog timing** in the Implementation Directives table is revised. Only the cadence of the v0.1 → v0.2 backlog ladder shifts from 'leisurely, gated on user #2 / 3+ implementations' to a **6-week-to-credible-demo** cadence aligned with the Forrester April 2026 reporting window."*

| Version | Scope (Phase A framing) | Original timing | Revised timing (Phase A — REJECTED by Phase B) |
|---|---|---|---|
| v0 | 1-week core + 1-week onboarding (per Q2) | weeks 1–2 | weeks 1–2 (UNCHANGED) |
| v0.1 | Multi-harness: Codex sprite + Claude sprite in same Slack channel | "when user #2 asks" | **week 4** (pulled forward) |
| v0.2 | Hosted demo on `agp.intentsolutions.io` (per CISO scoped-subdomain) | "when 5 self-hosters ask" (was v0.8) | **week 6** (pulled forward) |
| v0.3+ | Sigstore signing, per-tenant KMS, WebAuthn, Co-pilot mode, RFC sequencing | Q3 2026 | Q3 2026 (UNCHANGED) |

</details>

### What is NOT being amended

The five locked decisions remain in force exactly as ratified:

- **Q1 (OSS-first + Apache 2.0)**: locked.
- **Q2 (2-week v0 = 1-week core + 1-week onboarding)**: locked.
- **Q3 (Jeremy himself for build; small dev teams for adoption)**: locked.
- **Q4 (honest threat model + MARKETING_CLAIMS.md + CISO veto + allowed v0 claim "signed audit log of every tool call")**: locked.
- **Q5 (no RFCs at v0; CSO 4-phase sequencing; CMO lone strong dissent logged)**: locked. The 4-phase RFC sequencing is unchanged — informal-temperature-only through v0.5 → v0.7, then formal RFC submission at v1+. The 6-week-to-demo cadence does NOT shorten the RFC sequencing.

The CISO non-negotiables (schema-slot reservation at first commit, `agp.intentsolutions.io` scoped subdomain, sprite-identity via Sigstore by v0.6, MARKETING_CLAIMS.md as code with CISO veto) all remain locked. The CMO dissent on Q5 remains logged verbatim.

### Authority

This amendment is recorded by the **session-level facilitator (Claude, acting-head role)** under the same 2026-05-27 delegation Jeremy gave for the original session, and is forwarded to Jeremy for ratification on the same in-band channel that ratified the original 5 recommendations. **Re-deliberation is NOT triggered**: this is a timing revision driven by post-deliberation market intelligence, not a strategy revision. Per the council's adversarial integrity standard, if any seat would have voted differently had this market intelligence been available during deliberation, a re-deliberation MAY be requested by Jeremy at his discretion — but the acting head's read is that no seat's vote would flip on this evidence. Specifically: CMO's lone Q5 dissent would have been reinforced (CMO already argued category-authorship cost was the binding constraint) but CMO's vote was already a dissent; the majority's reasoning (security debt, OSS-temperature sequencing, CFO bandwidth) is not undermined by a 6-week-to-demo cadence that keeps RFC sequencing on its original track.

The amendment takes effect immediately and is part of the binding plan from the moment of commit.

— Claude, Acting Head of Board · 2026-05-27 (amendment)

## References

- Synthesis v1 (pre-cannon): `/tmp/agp-synthesis-v1.md`
- Synthesis v2 (post-cannon): `/tmp/agp-synthesis-v2.md`
- Cannon adversarial review summary: `~/.claude/skills/exec-decision-council/sessions/2026-05-27-agp-strategic-direction/inputs/cannon-summary.md`
- Full session JSONL (verbatim per-seat): `~/.claude/skills/exec-decision-council/sessions/2026-05-27-agp-strategic-direction/session.jsonl`
- ISEDC reusable pattern: `~/.claude/skills/exec-decision-council/SKILL.md`
- Source CCSC repo (governance kernel primitives): `~/000-projects/claude-code-slack-channel/` (v0.10.0 shipped 2026-05-24)
- Browser Use architecture reference (`Two Ways to Sandbox Agents`): https://browser-use.com/posts/two-ways-to-sandbox-agents
- Larsen Cundric's post that sparked the conversation: https://x.com/larsencc/status/2027225210412470668
