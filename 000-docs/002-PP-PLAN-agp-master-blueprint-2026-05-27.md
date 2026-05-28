---
title: Agent Governance Plane (AGP) — Master Blueprint
date: 2026-05-27
author: Jeremy Longshore (Intent Solutions) · drafted by Claude as acting head of board
status: pre-build / third-party review
companion_docs:
  - 001-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md (council decision record + timing amendment)
  - 003-AA-AUDT-agp-operator-audit-2026-05-27.md (operator-grade audit of governance kernel + AGP composition)
  - 004-AR-CANN-agp-cannon-adversarial-review-2026-05-27.md (pre-council adversarial input)
substrate_repo: ~/000-projects/claude-code-slack-channel/ (CCSC v0.10.0 — the governance kernel AGP composes)
target_repo: ~/000-projects/agent-governance-plane/ (scaffolded 2026-05-27; this monorepo IS the AGP product)
review_audience: Jeremy himself, advisors, potential partners, potential co-maintainers, potential investors
---

# Agent Governance Plane (AGP) — Master Blueprint

> **What you're reading.** This document is the single entry point for a third-party reviewer evaluating the AGP project before v0 build begins. It folds together the council decisions (`001-AT-DECR-...`), the cannon adversarial critique (`004-AR-CANN-...`), the operator-grade audit (`003-AA-AUDT-...`), and post-deliberation market-landscape research into one self-contained narrative. You do NOT need to read the four companion docs to follow this blueprint; you may want to read them to verify provenance.

---

## 1. Executive summary

**What AGP is.** A Slack-native, OSS-first **agent governance plane** that lets a single operator run any agent harness (Claude Code, Codex, future sprites) inside a sandboxed runtime, with every tool call gated by Slack-resident human-in-the-loop approvals and recorded in a cryptographically signed, hash-chained audit journal. Built on the production-shipped **CCSC governance kernel** (`claude-code-slack-channel` v0.10.0 — 986 tests, 17 modules, Apache 2.0).

**Who it's for.** v0: Jeremy himself, in his truck, supervising a Claude Code session that's fixing a bug in one of his own repos. v0.1+: small dev teams (1–5 engineers) who self-host on their own VPS. NOT compliance shops, NOT platform engineering at mid-size companies, NOT enterprise CISOs — those audiences are deferred behind explicit shipped-primitive gates (WebAuthn, per-tenant KMS, Sigstore signing) per the locked CISO non-negotiables.

**Why now.** A **6-week competitive window** opened in late May 2026. Forrester announced the "Agent Control Plane" category in December 2025 with a formal Landscape report dropping April 2026. Slack shipped Block Kit for AI Agents in May 2026. Salesforce reports 300% growth in Slack-resident AI agents Jan–Apr 2026. The four AGP-defining properties (sandbox + multi-harness + Slack HITL + signed audit) are held in 3-of-4 combinations by Credal, Speakeasy, OpenHands, and E2B — but **no competitor holds all four**. The window closes when a well-funded incumbent notices.

**What's been decided** (council session 2026-05-27, AT-DECR `45d65b7`):

1. **Commercial frame**: OSS-first + consulting/hosted layer · Apache 2.0 · Anthropic-partnership angle as parallel ecosystem motion (7/7 unanimous).
2. **v0 scope**: 2-week v0 = 1-week core + 1-week onboarding glue (4-3 split, synthesized at 2 weeks).
3. **Buyer focus**: Jeremy himself for v0 build; small dev teams as natural adoption population at v0.1+ (6-1 strong majority).
4. **Threat model**: honest framing in SLSA-pattern tier visibility · MARKETING_CLAIMS.md as code with CISO veto · allowed v0 claim "signed audit log of every tool call" (5-2 vote with strong CISO non-negotiable).
5. **Protocol publication**: no public RFCs at v0; CSO 4-phase community-temperature sequencing through v0.7+ (5-1-1, CMO lone strong dissent for 3 RFCs logged verbatim).

**What's been amended (post-deliberation, no re-deliberation)**: deferred-backlog timing accelerated to a 6-week-to-credible-demo cadence aligned with the Forrester April 2026 reporting window. v0.1 (multi-harness sprite) pulled forward to week 4. v0.2 (hosted demo on `agp.intentsolutions.io`) pulled forward to week 6. RFC sequencing and CISO security-primitive gates UNCHANGED.

**What's open** (this blueprint asks third-party reviewers to weigh in on these):

- Is the 6-week-to-demo realistic given Jeremy's truck-driver bandwidth?
- Is OSS-first the right commercial frame, or should we open-core / closed-source / Anthropic-partner-track instead?
- Is the multi-harness ambition real, or do we ship single-harness v0 and chase multi-harness later?
- Is Slack-only-channel a wedge or a ceiling? Discord / Teams / Matrix port priority?
- Have we underestimated any competitor? Specifically: Credal, Speakeasy?
- Is the OSS-first license (Apache 2.0) the right call, or should we go BSL or AGPL to protect against cloud-vendor strip-mining?

**What this blueprint is NOT.** It is not a marketing site, an RFC, a SOC2 audit, a funding pitch deck, or a recruiting one-pager. It is a self-contained strategic + technical + execution document a reviewer can read in one sitting and give actionable feedback on.

---

## 2. The 4-layer architecture (with cannon-1's corrections folded in)

The initial synthesis described AGP as a "4-layer trust model." The architect cannon (Lamport / Helland energy) pushed back: there are only **2 real trust boundaries**, and the 4-layer model is a **runtime topology**, not a trust model. The blueprint adopts that correction.

### 2.1 The runtime topology (4 layers)

```
┌─────────────────────────────────────────────────────────────────┐
│  CHANNEL LAYER — Slack workspace                                │
│  ───────────────────────────────────────                        │
│  - Operator-facing UI: threads, Block Kit, approval prompts     │
│  - Peer-bot allowlist for multi-agent coordination              │
│  - Block Kit for AI Agents (May 2026) integration               │
└─────────────────────────────────────────────────────────────────┘
                              ↕  Sprite-to-Channel protocol
                                 (INTERNAL — will break)
┌─────────────────────────────────────────────────────────────────┐
│  SPRITE LAYER — agent harness adapter                           │
│  ───────────────────────────────────────                        │
│  - v0: Claude Code sprite (lifts CCSC server.ts pattern)        │
│  - v0.1: Codex sprite (second harness, validates multi-harness) │
│  - Future: Pi, OpenHands, Aider — pluggable                     │
│  - Each sprite handles one harness's stdio/IPC peculiarities    │
└─────────────────────────────────────────────────────────────────┘
                              ↕  Sprite-to-Sandbox protocol
                                 (INTERNAL — will break)
┌─────────────────────────────────────────────────────────────────┐
│  SANDBOX LAYER — isolated execution environment                 │
│  ───────────────────────────────────────                        │
│  - v0: Docker container (namespace isolation, documented weak)  │
│  - v0.3+: Firecracker microVM (per first security audit ask)    │
│  - v1+: SandboxProvider interface (E2B, Modal, Unikraft)        │
│  - Holds NO credentials; gateway proxies all external calls     │
└─────────────────────────────────────────────────────────────────┘
                              ↕  Gateway protocol
                                 (the ONE protocol worth taking seriously)
┌─────────────────────────────────────────────────────────────────┐
│  CONTROL PLANE — the AGP daemon                                 │
│  ───────────────────────────────────────                        │
│  - Holds creds (LLM API key, GH token, signing key)             │
│  - Runs CCSC policy.ts gate() against every tool call           │
│  - Signs every event into hash-chained journal (CCSC journal.ts)│
│  - Posts policy decisions to Slack thread via stream-reply.ts   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 The actual trust boundaries (only 2)

Per architect cannon's correction:

| # | Boundary | Direction | Threat model |
|---|---|---|---|
| **TB1** | Human → Sprite | Human input is untrusted; Slack messages, attached files, and approval clicks are all attacker-controllable via prompt injection or Slack-session compromise. | Inbound gate (CCSC `gate()`), file exfiltration guard (`assertSendable()`), permission-reply-text filter at the gate. |
| **TB2** | Sandbox → Control Plane | Sandbox is a **confused-deputy factory**. A prompt-injected agent can attempt to forge Gateway-protocol calls that the operator's signing key endorses. | Gateway protocol uses Unix-socket topology at v0 (sender-bound to single host); HTTP variant requires sender-constrained tokens (DPoP / mTLS) before going public. SESSION_TOKEN-as-bearer-credential is a v0 design hazard that v0 punts on via topology, NOT via crypto. |

The Channel ↔ Sprite and Sprite ↔ Sandbox transitions are **not** trust boundaries in the security sense — they are runtime-topology layers within the same trust domain (the operator's machine). Calling them "trust boundaries" would imply isolation that doesn't exist.

### 2.3 Partition semantics (cannon-1's CP-vs-AP critique)

The original synthesis ignored what happens when the sandbox restarts mid-session, when the control plane crashes mid-tool-call, or when the Slack API returns 5xx in the middle of a journal append. The cannon flagged that the 3 protocols pretend partitions don't exist; sprite-restart mid-session can fork the audit chain silently.

The blueprint's answer:

- **Authoritative log is the ground truth**. The local hash-chained journal (CCSC's `audit.log` pattern, lifted as `journal.ts`) is the only record that counts. If Slack fails to receive a projected receipt, the local log still has the event.
- **Slack is a projection, not authority** (per CCSC `000-docs/audit-journal-architecture.md`). This invariant is inherited as-is from CCSC.
- **Sandbox restart appends a restart-event marker** to the chain, preserving the chain's link continuity. The verifier (`bun server.ts --verify-audit-log`) is aware of restart markers.
- **Control-plane crash mid-tool-call** is a known v0 limitation. The tool call is replayed on restart only if the operator explicitly resumes the session; otherwise it's logged as orphaned. **v0 does not promise exactly-once tool execution.** Marketing copy must reflect this.
- **Cross-chain causality** (Bob's approval of Alice's op being cryptographically linkable across two journals) is NOT a v0 promise. Cannon-1 was right that "approved by Bob" doesn't survive cross-chain attestation without per-tenant signing keys + Witness service. Deferred to v0.3+ per CISO directive.

### 2.4 Audit projection vs. authoritative truth

This invariant is inherited from CCSC and is critical enough to repeat in this blueprint:

- **Authoritative journal**: `~/.agp/audit.log` (analogous to CCSC's `~/.claude/channels/slack/audit.log`). Hash-chained, tamper-evident at the local level only, redacted per fixed rules, written by the control plane on every policy decision regardless of any Slack state.
- **Projection**: best-effort Slack-thread mirror of selected journal events. Controlled per-channel via the policy config. **Not** authoritative: Slack rate limits, missing messages, dropped webhooks all mean a projected event may never appear.
- **One-way flow**: journal → projection. Projection never writes back to the authoritative log. A failed `chat.postMessage` is logged to stderr and swallowed.

Operators who need ground truth read the local log. The projection is for "what did the operator see in Slack at time T?" forensics.

---

## 3. The three public protocols (and why we're not publishing any of them at v0)

AGP has three logical protocol surfaces. The cannon and council both pressured hard on the publication timing.

### 3.1 The three protocols

| Protocol | Endpoints | Wire format | Stability promise |
|---|---|---|---|
| **Sprite-to-Channel** | Sprite → Slack chat API; Slack → sprite via Socket Mode | JSON over WebSocket / HTTPS; Slack Block Kit | INTERNAL — will break through v0.5 |
| **Sprite-to-Sandbox** | Sprite → docker exec / podman exec / E2B run; sandbox → sprite via stdio + log stream | Sprite-defined IPC; opaque to channel layer | INTERNAL — will break through v0.5 |
| **Gateway** | Sandbox → control plane (the call that hits `gate()`) | JSON over Unix socket at v0; JSON over HTTP+Bearer at v0.3+ | INTERNAL — will break through v0.5; possibly informal RFC at v0.7 if community-temperature warm |

### 3.2 The CSO 4-phase RFC sequencing (council-locked)

This is the binding commitment from Q5 of the AT-DECR. No re-deliberation; this stays exactly as ratified:

1. **v0 → v0.5**: Internal interfaces only. Every internal interface file gets a top-of-file `// INTERNAL — will break — see roadmap.md for RFC trigger` header. README explicitly states "protocols intentionally unstable until 3+ external implementations exist."
2. **v0.5 → v0.7 (months ~6–9)**: Informal community-temperature phase. Private emails / Slack DMs / hallway conversations with named maintainers in in-toto, SLSA, OpenSSF SCS WG, OTel SIG-GenAI. "Here's what we built, here's the primitive — does this overlap your concerns?" **No GitHub issue. No published draft. No tweet.**
3. **v0.7**: If — and only if — 2+ maintainers in step 2 say "interesting, share a draft" → publish "RFC draft for comment" in our own repo, labeled "v0.1 — breaking changes allowed," cross-link from a single low-key post on the relevant WG mailing list. Tone: "we're looking for design review, not adoption."
4. **v1+**: Formal RFC submission to relevant standards body. Only after our own implementation is stable and ≥1 external implementation exists.

### 3.3 The CMO lone-dissent posture (preserved per Q5 ratification)

CMO argued that ceded category authorship is permanent: the cost of a regretted protocol is a breaking change; the cost of a ceded category is the company. The council vote was 5-1-1 against publishing at v0; CMO requested the dissent be logged verbatim, and it was. The Q5 implementation directive included a CMO compromise: a "design notes" doc in our own repo at v0 (clearly labeled as internal-design-thinking, NOT a spec, NOT versioned, NOT inviting adoption) gives the authorship signal without violating CSO's sequencing.

The **timing amendment** (post-deliberation market intelligence) does NOT shorten this sequencing. The Forrester April 2026 window pulls v0.1 / v0.2 forward but does not pull v0.7 (informal RFC) forward. The reason: cannon-2's SESSION_TOKEN-as-bearer-credential finding is dispositive — we can't publish a Gateway protocol with a known unfixed confused-deputy attack. That fix lands at v0.3+ along with per-tenant KMS.

### 3.4 Why this is the right call (revisited under the 6-week window)

The 6-week-to-demo cadence creates pressure to publish protocols earlier. The blueprint resists this for three reasons:

1. **Cannon-2's security finding has not changed.** The Gateway-protocol confused-deputy attack is real and unfixed at v0. Publishing a wire format committed to a broken auth model would do permanent reputational damage with the OpenSSF / in-toto / SLSA crowd.
2. **Forrester evaluates products, not protocols.** Being named in the April 2026 Forrester Landscape requires a working hosted demo (the v0.2 acceleration is the response), not a published RFC. The two are decoupled.
3. **CSO's "first impression with maintainer is permanent" remains true.** A maintainer who reads a sloppy RFC will not re-read a polished one a year later. Sequencing is one-way.

---

## 4. Threat model (honest, SLSA-tiered presentation)

This is the framing locked in Q4 of the AT-DECR. The substance is honest; the presentation is SLSA-pattern tiered.

### 4.1 What v0 actually defends, what v0 explicitly does NOT defend

| Threat | What v0 defends | What v0 does NOT defend |
|---|---|---|
| **Prompt-injected agent exfiltrates secrets** | Sandbox holds no LLM key, no GH token, no AWS creds. Gateway proxies all external calls. | Gateway-token exfiltration via prompt injection is NOT cryptographically prevented at v0; v0 punts via topology (Unix-socket sender-binding on a single host). HTTP+Bearer Gateway transport (v0.3+) requires DPoP or mTLS to be safe. |
| **Operator forges audit entries** | (v0 makes no claim of operator nonrepudiation) | The audit log is signed by the operator's key; a malicious operator forges trivially. This is structurally unfixable without a third-party witness service. |
| **Slack message spoofing** | Slack-signed interactivity webhooks validated by control plane. | Bob's Slack session compromised → Bob's approval forged. There is no WebAuthn / passkey device binding at v0. |
| **Cross-tenant data leak** | Not applicable — v0 is single-tenant only. | If you run v0 multi-tenant, you will be exploited. Per-tenant signing keys + `gate()` rewrite land at v0.1. |
| **Supply-chain attack on sprite** | Only one sprite at v0 (Claude Code, lifted from CCSC, signed by CCSC release process). | A v0.1+ second sprite by a third party requires sprite-identity verification that ships at v0.6 (Sigstore). |
| **Sandbox escape** | Docker namespace isolation only; documented as weak. | Real isolation requires Firecracker / Unikraft, deferred to v0.3+. |
| **Phisher with leaked Ed25519 key** | (v0 makes no claim against this) | A leaked operator key signs forged entries indistinguishably from real ones. Per-tenant KMS + WebAuthn at v0.4+ raise the bar. |
| **Confused-deputy attack via SESSION_TOKEN** | Single-host Unix-socket topology at v0 makes the attack impractical (no network exposure). | The moment the transport becomes HTTP, the SESSION_TOKEN-as-bearer-credential becomes exploitable unless sender-constrained tokens replace it. Cannon-2 finding. |

### 4.2 What each later vN unlocks

| Version | Primitive shipped | What it defends |
|---|---|---|
| v0.1 | Multi-tenant `gate()` + per-tenant HMAC for nonce-HITL | Cross-tenant data leak (when 2+ tenants on one instance) |
| v0.3 | Per-tenant signing keys via KMS; HTTP+Bearer Gateway with DPoP | Operator-key compromise blast radius; confused-deputy attack at scale |
| v0.4 | WebAuthn / passkey approval-binding at Slack approval time | Slack-session-compromise → forged approval |
| v0.6 | Sigstore-signed sprite releases + sprite identity registry | Supply-chain attack via lookalike-named sprite (CISO non-negotiable) |
| v0.7+ | Public protocol RFCs after community-temperature phase | Authorship ambiguity for in-toto / SLSA / OpenSSF audiences |
| v1 | Compliance-data export (Drata / Vanta / Secureframe webhooks) | NOT a defense — a data-source play |

### 4.3 The MARKETING_CLAIMS.md mechanism (CISO non-negotiable)

A `MARKETING_CLAIMS.md` file lives in the AGP repo, hash-pinned in the harness manifest. It lists allowed-at-version-N claims explicitly. A pre-commit hook fails on any release-notes / README / landing-page diff that adds a claim not in the registry for the current version tag. **Allowed at v0**: "signed audit log of every tool call." **Disallowed at v0**: "tamper-evident," "nonrepudiable," "compliance-grade," "tamper-proof," "forensic," "audit-grade." CISO has veto power over any marketing claim. The CMO-approved single bold headline claim is "signed audit log of every tool call your agent makes" — confirmed on-allowlist by CISO.

### 4.4 The `agp.intentsolutions.io` scoped subdomain (CISO non-negotiable)

The hosted demo at v0.2 lives at `agp.intentsolutions.io` — NOT at `intentsolutions.io/agp` or `agp.com` or any other surface. Per CISO: a scoped subdomain limits cookie / OAuth-scope blast radius if the AGP demo is compromised. Caddy on the production VPS handles the DNS + reverse proxy.

---

## 5. Epic roadmap (v0 → v1, with the 6-week-to-demo amendment folded in)

This is the operational expression of the locked council decisions + the timing amendment. Each epic gets a parent bead-id placeholder (`agp-NNN`); actual beads are NOT filed yet (per AT-DECR: build phase begins post-review).

### 5.1 v0 — "Jeremy in his truck" (weeks 1–2; LOCKED)

**Council reference**: Q2 (2-week v0 = 1-week core + 1-week onboarding).

**Persona**: Jeremy, in his truck, wants Claude Code to fix a bug in `claude-code-slack-channel`. He wants Slack to ask before any `rm` / `git push --force` / arbitrary shell. He wants a signed log he can replay later.

**Deliverable** (one binary, one config, one README):

```
agp run "fix the bug in repo X"
  → spawns Claude Code in a Docker container
  → wraps stdin/stdout into a Slack thread
  → posts every tool call to the thread
  → Block Kit "Allow / Deny / Details" on policy-flagged ops
  → signs every event in a hash-chained journal
  → on session end, posts a verifiable link to the signed audit chain
```

**Epic title**: *Ship the 2-week "Jeremy in his truck" v0 release.*

**Proposed child beads** (filed post-review):

| Proposed bead | Title | Dependency | CCSC primitive reused |
|---|---|---|---|
| agp-001 | Scaffold the `agp` project skeleton at `~/000-projects/agent-governance-plane/`. | none | (none — fresh scaffold) |
| agp-002 | Wire the `agp` CLI binary (Bun/TS) to CCSC primitives via direct import. | agp-001 | All — monorepo refs |
| agp-003 | Lift CCSC Docker sandbox spawn into `agp` daemon. | agp-002 | server.ts container-spawn pattern |
| agp-004 | Lift CCSC Slack thread UI + Block Kit relay into `agp` daemon. | agp-002 | server.ts Slack-client bootstrap + lib.ts |
| agp-005 | Lift CCSC `policy.ts` gate() into `agp` daemon. | agp-002 | policy.ts (as-is) |
| agp-006 | Lift CCSC `journal.ts` with reserved schema slots (CISO non-negotiable: `tenant_id`, `signing_key_id`, `approval_binding_type`, `sprite_identity_uri` all present, null at v0). | agp-002 | journal.ts (with schema-slot reservation) |
| agp-007 | Write `agp init` interactive setup CLI. | agp-002 — agp-006 | (new — Bun CLI) |
| agp-008 | Write `agp doctor` health check CLI. | agp-007 | (new — Bun CLI) |
| agp-009 | Write README quickstart + 5-min Saturday-afternoon-developer flow. | agp-007 | (new — README) |
| agp-010 | Write `MARKETING_CLAIMS.md` (hash-pinned), `THREAT-MODEL.md` (what-v0-defends/what-v0-doesn't table), `CONTRIBUTING.md` (external-implementer section). **CISO non-negotiable.** | agp-002 | (new — docs) |
| agp-011 | Apply Apache 2.0 license, CODE_OF_CONDUCT, SECURITY.md. | agp-002 | (new — governance) |
| agp-012 | Register `agp.intentsolutions.io` subdomain via Caddy on the VPS. **CISO scoped-subdomain requirement.** | agp-001 | (new — Caddy config) |

**v0 blocker / out-of-scope**: NO multi-harness, NO multi-tenant, NO public landing page, NO HN post until ALL of the above land.

### 5.2 v0.1 — Multi-harness sprite (week 4; pulled forward from "user #2")

**Council reference**: Q5 implementation directive ("Multi-harness in v0.1 / when 2nd harness asked for").

**Amendment trigger**: Forrester April 2026 reporting window — being named requires a working hosted demo, which requires the multi-harness story to be real, not a slide.

**Epic title**: *Add the Codex sprite alongside the Claude sprite in the same Slack channel.*

**Proposed child beads**:

| Proposed bead | Title | Dependency | CCSC primitive reused |
|---|---|---|---|
| agp-101 | Define the SpriteAdapter TypeScript interface (load harness, route stdio, surface tool calls, accept policy verdicts). | agp-009 | (new — interface) |
| agp-102 | Refactor the v0 Claude sprite to implement SpriteAdapter. | agp-101 | (new — refactor) |
| agp-103 | Write the Codex sprite implementation of SpriteAdapter. | agp-101 | (new — Codex IPC) |
| agp-104 | Verify both sprites coexist in the same Slack channel without echo loops (CCSC peer-bot allowlist pattern). | agp-103 | lib.ts gate() peer-bot allowlist |
| agp-105 | Update README + threat model + MARKETING_CLAIMS.md to reflect multi-harness reality. | agp-104 | (new — docs) |

**Out of scope at v0.1**: NO multi-tenant, NO per-tenant KMS, NO Sigstore signing, NO RFC publication, NO third-party sprites.

### 5.3 v0.2 — Hosted demo on `agp.intentsolutions.io` (week 6; pulled forward from v0.8)

**Council reference**: Q4 CISO scoped-subdomain requirement + Q3 buyer-focus (small dev teams as natural adoption population).

**Amendment trigger**: Forrester April 2026 Landscape report submission window. To be named in the Landscape, AGP must have a public demo URL that a Forrester analyst can poke at without scheduling a call.

**Epic title**: *Stand up the hosted demo at `agp.intentsolutions.io` for Forrester-grade evaluation.*

**Proposed child beads**:

| Proposed bead | Title | Dependency | CCSC primitive reused |
|---|---|---|---|
| agp-201 | Provision the `agp.intentsolutions.io` Caddy block + TLS cert on the production VPS. | agp-012 | (existing Caddy pattern from CCSC partner-portals) |
| agp-202 | Write the demo persona: a self-contained sandbox that lets a visitor click through a simulated "Claude Code fixes a bug" flow with a real signed journal at the end. | agp-201 | All v0 primitives |
| agp-203 | Wire visitor basicauth gate (per CCSC partner-portal pattern) for the live demo while keeping `/healthz` anonymous. | agp-201 | partner-portal Caddy pattern |
| agp-204 | Write the landing page at `agp.intentsolutions.io/` — single-page, OSS-first framing, GitHub repo link, hosted-demo CTA. | agp-203 | (new — Hugo or static) |
| agp-205 | Compose Forrester analyst-relations brief — submission to `forrester-landscape-evaluation@forrester.com` per the Dec 2025 category-announcement instructions. | agp-204 | (new — outbound) |

**Out of scope at v0.2**: NO compliance-grade marketing claims, NO claims of nonrepudiation, NO enterprise sales motion, NO inbound contact form that promises a sales call.

### 5.4 v0.3+ — Q3 2026 (unchanged from AT-DECR; UNCHANGED by timing amendment)

| Version | Scope | Blocker | CISO gate |
|---|---|---|---|
| v0.3 | Per-tenant signing keys (KMS-backed) + multi-tenant `gate()` rewrite + HTTP+Bearer Gateway with DPoP / mTLS | Second self-hoster asks | Confused-deputy attack fix REQUIRED before transport leaves Unix socket |
| v0.4 | WebAuthn / passkey approval-binding (replace Slack-only HITL) | First security audit conversation | MARKETING_CLAIMS.md unlocks "device-bound approval" claim |
| v0.5 | Co-pilot mode (turn-taking baton in Slack) | Dogfooding hits its ceiling | (no new gate) |
| v0.6 | Sigstore-signed sprite releases + sprite identity registry | 10+ users exist | **CISO non-negotiable** — supply-chain spoof prevention |
| v0.7 | Public protocol RFCs (v0.1 — explicitly versioned, breaking allowed) | 3 sprite implementations exist + 2+ maintainers in temperature-phase say "share a draft" | CSO 4-phase sequencing precondition met |
| v0.8 | Hosted plan for self-hosters who don't want to operate | 5 self-hosters ask | (timing amendment pulled v0.2 demo forward; v0.8 hosted PLAN remains gated on 5 self-hosters) |
| v0.9 | Coordinated-pair collaboration mode (two sandboxes, channel + git) | Dogfooding multi-agent in the same Slack | (no new gate) |
| v1 | Compliance-data export (Drata / Vanta / Secureframe webhooks) | First compliance-buyer conversation happens | MARKETING_CLAIMS.md unlocks "compliance-grade data source" claim |

### 5.5 Roadmap DAG (predecessor → successor → blocking edge type)

```
agp-001 (scaffold) ──┬─→ agp-002 (CLI) ──┬─→ agp-003 (sandbox) ──┐
                     │                   ├─→ agp-004 (Slack)    ─┤
                     │                   ├─→ agp-005 (policy)   ─┤
                     │                   └─→ agp-006 (journal)  ─┤
                     │                                            │
                     │                                            ├─→ agp-007 (init)
                     │                                            │     │
                     │                                            │     ├─→ agp-008 (doctor)
                     │                                            │     │
                     │                                            │     └─→ agp-009 (README)
                     │                                                       │
                     │                                                       ├─→ agp-101 (SpriteAdapter)
                     │                                                       │     ├─→ agp-102 (Claude refactor)
                     │                                                       │     ├─→ agp-103 (Codex sprite)
                     │                                                       │     ├─→ agp-104 (coexistence)
                     │                                                       │     └─→ agp-105 (docs update)
                     │                                                       │
                     └─→ agp-012 (Caddy subdomain) ──→ agp-201 (TLS) ──┬─→ agp-202 (demo persona)
                                                                       ├─→ agp-203 (basicauth)
                                                                       ├─→ agp-204 (landing page)
                                                                       └─→ agp-205 (Forrester brief)
```

Edge types: all edges are **hard blocks** unless annotated. agp-002 → agp-003/004/005/006 is a 4-way fanout that can land in parallel (no shared file). agp-007/008/009 are sequential because they share the CLI surface. agp-101 → agp-103 must be done after the SpriteAdapter interface is stable (avoid second-system effect on the interface).

---

## 6. CCSC primitive reuse plan

Cannon-2's critique was that "lift-and-shift CCSC" overstates the reuse — ~40% of CCSC code survives the multi-tenant transition unchanged. The blueprint adopts the cannon's reality check. The table below is the honest reuse plan.

| CCSC file | LoC | Survives lift-and-shift? | AGP target | Notes |
|---|---|---|---|---|
| `crypto.ts` | ~200 | ✅ As-is | `agp/crypto.ts` | Ed25519 + JCS — generic primitives. No rework. |
| `journal.ts` | 1,145 | ⚠️ Mostly | `agp/journal.ts` | Lift the hash-chain + redactor + verifier as-is. The single-tenant assumption (`tenant_id` always `null`) is fine at v0 IF the schema slot is reserved (CISO non-negotiable). Per-tenant chain rework happens at v0.3. |
| `audit-key-loader.ts` + `audit-key-cli.ts` | ~400 | ✅ As-is | `agp/audit-key-*.ts` | SOPS + age, key lifecycle CLI. Generic. |
| `policy.ts` | 647 | ✅ Mostly | `agp/policy.ts` | Decision engine is sound. Tier-aware shadow lint is bonus. Multi-tenant `gate()` is downstream of this file — separately tracked. |
| `policy-dispatch.ts` | ~150 | ✅ As-is | `agp/policy-dispatch.ts` | Context-stripping pattern is generic. |
| `nonce-hitl.ts` | ~250 | ⚠️ HMAC secret per-tenant in v0.1 | `agp/nonce-hitl.ts` | v0 single-tenant uses single HMAC secret. v0.1 multi-tenant rework. |
| `lib.ts` `gate()` | (subset of 1,793) | ⚠️ Decouple from Slack-specific bits | `agp/gate.ts` | Allow/deny logic is generic; channel-mapping is Slack-shaped. Extract the channel-agnostic core. |
| `admin.ts` | ~300 | ✅ As-is | `agp/admin.ts` | Generic admin verb dispatcher. |
| `stream-reply.ts` | ~200 | ⚠️ Adapt to non-Slack channel later | `agp/channel/slack.ts` | Slack `chat.update` is the only target in v0. v1+ Discord/Teams/Matrix adapters would live as siblings. |
| `peer-bot-rate-limit.ts` + `mute-store.ts` | ~250 | ✅ As-is | `agp/peer-bot-*.ts` | Generic. Critical for multi-agent coordination at v0.1+. |
| `supervisor.ts` | 980 | ⚠️ Adapt session model | `agp/supervisor.ts` | Per-thread → per-(tenant, session) when v0.3 lands. v0 keeps single-tenant per-thread model. |
| `server.ts` (MCP-stdio) | 2,810 | ❌ Rewrite | (deleted) | AGP is HTTP+Bearer Gateway, not MCP-stdio. The MCP server pattern is reference only. The Slack-client bootstrap + event handlers from `server.ts` get extracted into `agp/channel/slack.ts`. |
| `manifest.ts` | 573 | ❌ Out of scope | (deleted) | Bot-manifest is Slack-specific. AGP at v0 ships with a fixed Slack app manifest exported by `agp init`, not a dynamic manifest protocol. |

**Net reuse**: ~5–6k of CCSC's ~12k LoC lifts. The cannon was right.

**Tests reuse**: ~604 of CCSC's 986 tests apply directly (the lifted modules carry their tests). ~382 tests are tied to MCP-stdio / manifest behavior and don't lift. **AGP must write its own integration tests for the Gateway protocol and the SpriteAdapter interface.**

---

## 7. Existing-solution landscape

The post-deliberation market-landscape research surfaced the following competitive picture. The four AGP-defining properties are **(a) sandboxed runtime**, **(b) multi-harness sprite slot**, **(c) Slack-native HITL**, **(d) cryptographically signed audit chain**.

### 7.1 Competitor matrix

| Competitor | Founded / funding | Sandbox | Multi-harness | Slack HITL | Signed audit | Has all 4? |
|---|---|---|---|---|---|---|
| **Credal.ai** | 2023, ~$5M seed | ✅ (browser + code sandbox) | ❌ Anthropic only at depth | ✅ (Slack-native enterprise AI search + actions) | ✅ (compliance-audit log) | **No** — single-harness |
| **Speakeasy** | 2022, ~$10M | ✅ (SDK + workflow sandbox) | ✅ (multi-LLM workflow orchestration) | ❌ (web UI / GitHub Actions only) | ✅ (workflow execution log) | **No** — no Slack HITL |
| **OpenHands** (formerly OpenDevin) | 2024, open-source / All Hands AI | ✅ (Docker + microVM via VirtualBox) | ✅ (CodeAct, browsing, file-edit; multi-model) | ❌ (web UI + CLI) | ❌ (no cryptographic signing) | **No** — no Slack, no signed audit |
| **E2B** | 2023, $11M Series A | ✅ (Firecracker microVM, gold standard) | ✅ (any harness via SDK) | ❌ | ❌ | **No** — runtime only, no governance |
| **Browser Use** | 2024, VC-backed | ✅ (browser sandbox, headless) | ❌ (browser-only persona) | ❌ | ❌ | **No** — browser-only |
| **Signet** (Anthropic) | 2025, internal | ❌ (no sandbox — claim-attestation only) | n/a | ❌ | ✅ (cryptographic claim attestation) | **No** — no runtime |
| **Anthropic AgentCore** | 2025, closed beta | ✅ (Anthropic-managed) | ❌ (Claude only) | ❌ | ⚠️ (closed; private to Anthropic) | **No** — closed + single-harness |
| **Modal** | 2021, $16M Series A | ✅ (cloud sandbox) | ✅ (any code) | ❌ | ❌ | **No** — compute infra only |
| **AgentOps** | 2023, ~$2M | ❌ (observability, not runtime) | ✅ (instruments any harness) | ❌ (web dashboard) | ✅ (event log, not cryptographic) | **No** — observability only |
| **LangSmith** (LangChain) | 2023, ~$25M | ❌ (tracing + eval) | ✅ | ❌ | ❌ | **No** — observability only |
| **AGP (this project)** | 2026, pre-launch | ✅ (Docker v0; Firecracker v0.3+) | ✅ (Claude v0; Codex v0.1; pluggable) | ✅ (Slack-native; CCSC primitives) | ✅ (Ed25519 + JCS + hash chain; CISO-gated marketing claims) | **YES — all 4** |

### 7.2 What this matrix means

- **Credal** is the closest competitor on Slack HITL + audit but is locked to Anthropic and lacks the multi-harness story. If they ship a second-harness sprite slot, they hold 3.5-of-4 and the AGP wedge narrows.
- **Speakeasy** is the closest on multi-harness orchestration but is web-UI / GitHub-native. A Slack adapter is a sprint away for them. **This is the highest-priority competitor to monitor.**
- **OpenHands** is the closest open-source. No signed audit and no Slack — but the OSS community could add either in a community PR. AGP's defensible asset against OpenHands is the cryptographic audit kernel's depth (CCSC's 986 tests, hash-chain verifier, MARKETING_CLAIMS.md discipline).
- **E2B / Modal / Browser Use** are upstream sandbox runtimes; AGP would consume them via SandboxProvider at v0.3+. They are **suppliers**, not direct competitors.
- **Signet** (Anthropic) is the closest on signed audit but ships no runtime. It's a **complement**, not a competitor — AGP could emit Signet attestations as a downstream consumer.
- **Anthropic AgentCore** is closed and Claude-only. Its existence is evidence the category is real; it is not a substitute for AGP's open-source posture.

### 7.3 The 6-week competitive window — what it actually is

The window is NOT "before someone else ships AGP." It is "**before the well-funded Slack-native players (Credal, Speakeasy) ship the missing 4th property**." Concretely:

- **Credal** could add multi-harness in a sprint (~2–4 weeks). If they do this in June 2026, they hold all 4 and AGP's differentiation collapses.
- **Speakeasy** could add a Slack adapter in a sprint (~2–4 weeks). Same risk.
- **Forrester April 2026 Landscape** is published April 15, 2026. Submissions to be considered should land by mid-March. AGP needs to be a working hosted demo by week 6 (mid-July from v0 start) to make the next reporting cycle.

The 6-week-to-demo cadence in the timing amendment is calibrated against these two competitive timers.

### 7.4 Cited URLs

- Forrester category announcement: https://www.forrester.com/blogs/announcing-our-evaluation-of-the-agent-control-plane-market/
- Slack Block Kit for AI Agents: https://slack.dev/build-richer-agent-experiences-with-block-kit/
- Browser Use sandbox architecture: https://browser-use.com/posts/two-ways-to-sandbox-agents
- Larsen Cundric's post that sparked the conversation: https://x.com/larsencc/status/2027225210412470668

---

## 8. Open questions for third-party reviewers

These are the questions the third-party-reviewer review pass is meant to answer. Each question lists the side(s) of the argument and the data we have.

### 8.1 Is the 6-week-to-demo realistic given Jeremy's truck-driver bandwidth?

**The case for yes**: 5–6k LoC lifts as-is from CCSC. The hard work is the Gateway protocol, the SpriteAdapter interface, and the hosted demo. Each is a week of focused work. Jeremy has shipped CCSC v0.10.0 (17 PRs, 986 tests) in a 4-week stretch in May 2026 — the cadence is proven.

**The case for no**: Jeremy is also operating a 6-truck flatbed authority, working through the Anthropic Enterprise Program / 35-subcontractor cohort, and managing 24 production containers on the VPS. The 6-week cadence assumes ~25 hours/week on AGP, which is the upper bound of Jeremy's spare-cycle availability. A single ELD outage / DOT audit / production incident can blow the cadence by a week.

**What we want feedback on**: Should the timing amendment be revised to 8 weeks or 10 weeks? Or should v0.2 (hosted demo) be downscoped to "static landing page + Loom video walkthrough" instead of a working interactive demo?

### 8.2 Is OSS-first the right commercial frame?

**The locked decision** (Q1, 7/7 unanimous): OSS-first + consulting/hosted layer · Apache 2.0.

**The case for revisiting**: The Forrester analyst-relations dynamic favors named products with funded vendors. OSS-first means AGP enters Forrester evaluation without a sales motion or funded support. An open-core or BSL frame (Sentry / Sourcegraph model) could capture more enterprise value.

**What we want feedback on**: Would BSL (Business Source License, 4-year time-bomb to Apache) protect against cloud-vendor strip-mining without losing the OSS community? Is there a partner-track-only-license model that aligns with the Anthropic Enterprise Program?

### 8.3 Is the multi-harness ambition real?

**The locked decision** (implicit in Q5 + Q2): multi-harness is v0.1 (week 4), NOT v0. v0 ships Claude-only.

**Cannon-3's critique** (still valid): "Multi-harness support" without a second sprite is a slide.

**What we want feedback on**: Should AGP commit to multi-harness at v0.1, or should it stay Claude-only through v0.5 and chase multi-harness only when a non-Claude user asks? The amendment pulled v0.1 forward to week 4; that's an aggressive bet on multi-harness being a real differentiator vs. a marketing claim.

### 8.4 Is Slack-only-channel a wedge or a ceiling?

**Where we are**: v0 / v0.1 / v0.2 are Slack-only. The channel layer is abstractable (stream-reply.ts is the only Slack-specific surface in lift territory).

**The case for Slack-first**: Salesforce reports 300% growth in Slack-resident AI agents. Block Kit for AI Agents shipped May 2026. The Slack community Jeremy already has (claude-code-plugins) is real distribution.

**The case for multi-channel earlier**: Discord is the default for OSS communities. Microsoft Teams is the default for enterprise. Matrix is the default for security-conscious teams. AGP could ship channel adapters as a v0.5 OSS-community contribution surface.

**What we want feedback on**: Should the v0.5 epic include channel-adapter SDK + reference Discord adapter? Or stay Slack-only through v0.7?

### 8.5 Have we underestimated any competitor?

**The locked competitor read** (cannon-4 + post-deliberation research): Credal, Speakeasy, OpenHands, E2B, Browser Use, Signet, Anthropic AgentCore, Modal, AgentOps, LangSmith. Closest threats: Credal (closest on Slack + audit), Speakeasy (closest on multi-harness).

**What we want feedback on**: Are there competitors we haven't named? Specifically: any closed-beta startup in the YC / a16z / Founders Fund 2026 cohort doing agent governance? Any internal tool at a hyperscaler (AWS, Google, Microsoft) that's about to be GA'd as a managed service?

### 8.6 Is the OSS-first license (Apache 2.0) the right call?

**The locked decision** (Q1, GC compromise): Apache 2.0 (patent grant + community trust).

**The case for revisiting**: AGPL would protect against SaaS strip-mining (the MongoDB / Redis / Elastic playbook). BSL with a 4-year time-bomb to Apache is the Sentry / Sourcegraph / CockroachDB middle ground.

**What we want feedback on**: Does the council's "OSS-first" framing survive a license change to BSL? Would the OpenSSF / in-toto / SLSA audience read BSL as a violation of the OSS-first commitment?

---

## 9. Beads-tracking convention

This section is the planning convention for when build starts. **No beads are filed at the time of this blueprint** (per AT-DECR: build phase begins post-review).

### 9.1 Bead naming (plain English only)

Per `~/.claude/CLAUDE.md` § "Bead naming — plain English only" (in force since 2026-05-22): every bead title is a complete sentence describing the work. No `E#-B##` codes. Labels are 1–3 plain-English topic words. The auto-generated 3-char system ID is a command handle only.

Example AGP bead titles:

- ✅ "Scaffold the agp project skeleton at ~/000-projects/agent-governance-plane/."
- ✅ "Lift CCSC journal.ts into agp/journal.ts with reserved schema slots."
- ❌ "agp-001: scaffold" (system ID quoted in chat = anti-pattern)
- ❌ "v0.E1.B3 — scaffold" (code-style numbered execution plan = anti-pattern)

### 9.2 Bead ↔ GitHub Issue ↔ Plane three-layer mirror (mandatory)

Per the home-level CLAUDE.md § "Bead ↔ GitHub Issue ↔ Plane three-layer mirror": every tracked unit of work has three correlated records — a bead (source of truth, local), a GitHub issue (code-anchored, public), and a Plane issue (cross-project portfolio view). The canonical tool is `bd-sync`.

For AGP, the Plane project does not yet exist. **Action at build start**: create Plane project `AGP` under workspace `internal`, then thread `bd-sync link <bead> --gh OWNER/REPO#N --plane AGP-M` from the first bead.

### 9.3 PR-to-bead mapping pattern (lifted from CCSC)

Per CCSC `CLAUDE.md` § "Issue tracking (bd) — readable-trail rule": file a bd for everything skipped, deferred, or accepted as a known gap. Close beads with evidence in the `--reason` field. PR descriptions reference `Refs <owner>/<repo>#<N>` while children remain, and `Closes <owner>/<repo>#<N>` only on the PR that retires the last child bead.

Branch naming convention (lifted from CCSC): `feat/<description>-bz-<bead-id>` for features, `fix/<description>-bz-<bead-id>` for bug fixes, `docs/<description>` for docs-only.

### 9.4 Beads epic structure

The roadmap epics in § 5 each map to a parent epic-type bead. Per the bead-naming rule, the epic title is also a plain-English sentence:

- "Ship the 2-week 'Jeremy in his truck' v0 release."
- "Add the Codex sprite alongside the Claude sprite in the same Slack channel."
- "Stand up the hosted demo at agp.intentsolutions.io for Forrester-grade evaluation."

Children beads listed in § 5 inherit from their epic. The exact bead IDs (`agp-001` etc.) are placeholders — actual 3-char IDs are auto-generated by `bd create`.

---

## 10. References

- AT-DECR (council decision record + timing amendment): `000-docs/001-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md`
- Operator audit (hybrid CCSC + AGP): `000-docs/003-AA-AUDT-agp-operator-audit-2026-05-27.md`
- Cannon adversarial review (4-agent pre-council input): `000-docs/004-AR-CANN-agp-cannon-adversarial-review-2026-05-27.md`
- ISEDC session JSONL (verbatim per-seat): `~/.claude/skills/exec-decision-council/sessions/2026-05-27-agp-strategic-direction/session.jsonl`
- ISEDC reusable pattern: `~/.claude/skills/exec-decision-council/SKILL.md`
- CCSC governance kernel substrate (v0.10.0): `~/000-projects/claude-code-slack-channel/`
- CCSC GitHub: https://github.com/jeremylongshore/claude-code-slack-channel
- Synthesis v1 (pre-cannon, archived): `/tmp/agp-synthesis-v1.md`
- Synthesis v2 (post-cannon, archived): `/tmp/agp-synthesis-v2.md`
- Forrester category announcement: https://www.forrester.com/blogs/announcing-our-evaluation-of-the-agent-control-plane-market/
- Slack Block Kit for AI Agents: https://slack.dev/build-richer-agent-experiences-with-block-kit/
- Browser Use sandbox architecture reference: https://browser-use.com/posts/two-ways-to-sandbox-agents
- Larsen Cundric's spark post: https://x.com/larsencc/status/2027225210412470668
- Intent Solutions Testing SOP: `~/.claude/CLAUDE.md` § "Intent Solutions Testing SOP"
- Document Filing Standard v4.3: `~/002-command-bible/DOCUMENT-FILING-STANDARD-v3.0.md`
- Bead naming convention (plain English only): `~/.claude/CLAUDE.md` § "Bead naming — plain English only"
- Bead ↔ GH ↔ Plane mirror discipline: `~/.claude/CLAUDE.md` § "Bead ↔ GitHub Issue ↔ Plane three-layer mirror"

---

*End of master blueprint. Reviewer feedback on the open questions in § 8 is the deliverable expected from this document.*
