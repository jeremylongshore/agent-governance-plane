---
title: AGP Competitive Landscape Refresh — Layer Map + Strategic Read
date: 2026-06-04
author: Jeremy Longshore (Intent Solutions) — analysis facilitated by Claude
status: internal analysis (recommends; does NOT change any locked decision)
answers: 002-PP-PLAN §8.5 ("Have we underestimated any competitor?")
companion_docs:
  - 001-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md (the 5 locked decisions this analysis pressures but does NOT change)
  - 002-PP-PLAN-agp-master-blueprint-2026-05-27.md (§7 competitor matrix + §8.5 open question this refreshes)
  - 003-AA-AUDT-agp-operator-audit-2026-05-27.md (CCSC substrate + composition)
scope: internal planning doc — out of claim-scan scope (000-docs/); competitors named freely
---

# AGP Competitive Landscape Refresh — Layer Map + Strategic Read (2026-06-04)

> **What this is.** An internal analysis that refreshes the blueprint's §7 competitor
> matrix and directly answers the blueprint's open question §8.5 ("Have we
> underestimated any competitor? … Any internal tool at a hyperscaler about to be
> GA'd as a managed service?"). The category moved hard in the ~week since the
> blueprint was written (2026-05-27). This doc maps the space in two lenses — a
> **layer map** (where everyone sits) and a **strategic read** (does the wedge
> still hold) — and ends with recommendations.
>
> **What this is NOT.** It is **not** a decision. It does not edit the locked
> blueprint, and it does not change any of the five council-locked decisions
> (Q1–Q5 in `001-AT-DECR`). Where the analysis finds pressure on a locked
> decision, it says so and **recommends an ISEDC council revisit** — the council
> is the only body that can change a locked decision. Everything below is input
> to that judgment, not a substitute for it.

---

## 1. Context & purpose — why now

The master blueprint (`002-PP-PLAN`, 2026-05-27) carried a §7 competitor matrix of
10 players and an explicit open question, §8.5: *"Are there competitors we haven't
named? … Any internal tool at a hyperscaler (AWS, Google, Microsoft) that's about
to be GA'd as a managed service?"* That question was filed as a known gap. This doc
closes it.

Live research on 2026-06-04 shows the agent-governance category accelerated in the
days after the blueprint froze:

- **Microsoft shipped the Agent Governance Toolkit (AGT) + the Agent Control
  Specification (ACS)** on 2026-04-02 — an open-source runtime-governance suite
  *and a published, vendor-neutral runtime-governance spec*. This is precisely the
  kind of hyperscaler move §8.5 asked about, and it lands on the exact ground AGP
  deliberately chose **not** to occupy at v0 (the Q5 "no public RFC at v0"
  decision). It is the single biggest strategic signal in this refresh.
- **Runtime (YC P26)** launched as an OSS, sandboxed, Slack-native, multi-harness
  coding-agent platform with HITL approvals and audit logging — the closest
  same-span competitor AGP has yet seen, closer than the blueprint's named
  "highest-priority" threats (Credal, Speakeasy).
- **specific.dev ("Specific")** — the player the user named first — turns out **not**
  to be a competitor at all. It is a *layer below* AGP: cloud infra/deploy *for*
  coding agents. It is complementary, and it is exactly the kind of high-privilege
  tool a governance plane would itself govern.
- **Credal** repositioned to a multi-agent, multi-model "control plane for enterprise
  agents" (which also corrects a factual error in the blueprint's matrix).
- **agent-guardrails** (OSS, MIT) appeared as a narrow pre-execution command-blocking
  layer.
- The **EU AI Act** timeline shifted under the 2026 AI Omnibus — a correction that
  matters for how AGP frames its demand-driver clock (see §6).

This refresh also surfaces **three factual corrections to the blueprint's §7
matrix** that an honest doc has to record (consistent with AGP's own honest-claims
discipline): the "Signet (Anthropic)" row is unverifiable as written; the "Anthropic
AgentCore" row is stale and possibly conflated with an AWS product; and the read of
Credal as "Anthropic only at depth" is now wrong. These are noted as
**recommendations to correct**, not unilateral edits — the blueprint is a frozen
foundation doc (see §6).

---

## 2. The layer map (taxonomy)

The blueprint frames the field through four AGP-defining *properties* (sandbox ·
multi-harness · Slack-native HITL · signed audit). That property matrix is still the
right scoring tool (§3 refreshes it). But the most useful orienting move for the
2026 field is a **layer map**: the agent stack has distinct layers, most "competitors"
live in a different layer than AGP, and confusing layers is how you mis-rank threats
(e.g. treating specific.dev as a rival, or E2B as a competitor rather than a supplier).

```
┌─ L5  OBSERVABILITY ──────────────────────────────────────────────┐
│  Tracing / eval / metrics. Watches; does NOT enforce.            │
│  AgentOps · LangSmith                                            │
├─ L4  AUDIT / ATTESTATION ────────────────────────────────────────┤
│  Provable record of what happened. Signed / chained evidence.   │
│  ★ AGP (Ed25519 + JCS + hash chain) · Microsoft AGT (Merkle +   │
│  HMAC) · [Anthropic Workload Identity Federation — identity side]│
├─ L3  GOVERNANCE / GATE ──────────────────────────────────────────┤
│  Policy + HITL on every tool call. allow/deny/sandbox/approve.  │
│  ★ AGP · Microsoft AGT/ACS · Runtime · Credal · agent-guardrails│
│  · OpenAI Agents SDK guardrails · LangChain guardrails          │
├─ L2  RUNTIME / SANDBOX ──────────────────────────────────────────┤
│  Isolated execution of agent actions.                           │
│  ★ AGP (Docker v0; Firecracker v0.3+) · E2B · OpenHands ·       │
│  Runtime · Browser Use · Claude Managed Agents (self-host sbx)  │
├─ L1  INFRA / DEPLOY *FOR* AGENTS ────────────────────────────────┤
│  Provisions the cloud the agent builds on. Holds secrets/DBs.   │
│  specific.dev · Modal · E2B (infra side)                        │
└──────────────────────────────────────────────────────────────────┘
            ★ = AGP spans L2 (orchestration) + L3 + L4
```

**How to read it.**

- **AGP's span is L3 (gate) + L4 (signed audit), orchestrating an L2 sandbox.** That
  vertical span across gate + audit + sandbox-orchestration, **fronted by a
  Slack-native HITL surface**, is the wedge — re-stated against the 2026 field.
- **specific.dev sits at L1** — *below* AGP. It is not a competitor; it is a
  complementary supplier and a govern-ee. An agent using Specific to provision a
  Postgres DB or push to prod is exactly the high-privilege action AGP's L3 gate
  would put behind a Slack approval. (Deep note in §4.1.)
- **E2B / Modal / Browser Use are L1–L2 suppliers**, not rivals — AGP consumes them
  via the SandboxProvider interface at v0.3+. (Unchanged from the blueprint.)
- **AgentOps / LangSmith are L5** — they watch, they don't enforce. Not substitutes.
- **The contested layer is L3.** As of 2026 the generic policy-gate is filling up:
  Microsoft, Runtime, Credal, agent-guardrails, plus framework-native guardrails
  from OpenAI and LangChain. **A bare allow/deny policy gate is commoditizing.**
- **The still-thin combination** is the *full vertical* — L3 gate + L4
  publicly-verifiable signed audit + L2 sandbox orchestration + a Slack-native HITL
  front. **No single player owns that exact span the same way** (§5 examines how
  close Runtime and Microsoft get).

---

## 3. Refreshed four-property matrix

Same four properties as the blueprint (sandbox · multi-harness · Slack-native HITL ·
signed audit). Re-verified the original 10; added the four 2026 entrants; corrected
three stale/erroneous rows. Layer column added so suppliers and complements aren't
mis-read as rivals. "Signed audit" is scored strictly: **publicly verifiable
(asymmetric)** signing is the bar AGP set, so HMAC-only and "compliance log"
audit are marked ⚠️ with the mechanism noted.

| Player | Layer | Sandbox | Multi-harness | Slack-native HITL | Signed audit | All 4? |
|---|---|---|---|---|---|---|
| **AGP** (this project) | L2–L4 | ✅ Docker v0 / Firecracker v0.3+ | ✅ Claude v0; Codex v0.1; pluggable | ✅ Slack-native (CCSC primitives) | ✅ Ed25519 + JCS + hash chain (publicly verifiable) | **YES** |
| **Microsoft AGT / ACS** | L3–L4 | ✅ sandbox is a policy action | ⚠️ framework-agnostic via ACS manifest; no per-harness "sprite" | ❌ generic approval workflows; no chat-native surface | ⚠️ Merkle hash-chain + **HMAC** (symmetric) | **No** — no Slack HITL; symmetric signing |
| **Runtime** (YC P26) | L2–L4 | ✅ isolated envs (E2B/Daytona/EC2/k8s) | ✅ Claude Code, Cursor, Codex, Copilot, Gemini CLI, Devin, OpenCode | ✅ @mention agents in Slack | ⚠️ "audit logs" — signing/chaining unconfirmed | **~3.5** — closest same-span rival |
| **Credal** | L3–L4 | ✅ browser + code sandbox | ✅ Claude/GPT/Gemini + MCP (was mis-read as Anthropic-only) | ⚠️ Slack-integrated (1 of 50+ connectors), not Slack-native | ✅ full traceability + SOC2 (not crypto-signed) | **No** — not Slack-native; enterprise buyer |
| **Speakeasy** | L3 | ✅ SDK/workflow sandbox | ✅ multi-LLM workflow | ❌ web UI / GH Actions | ✅ workflow log | **No** — no Slack HITL |
| **OpenHands** | L2–L3 | ✅ Docker + microVM | ✅ multi-model | ❌ web UI + CLI | ❌ none | **No** |
| **E2B** | L1–L2 | ✅ Firecracker (gold standard) | ✅ any harness via SDK | ❌ | ❌ | **No** — supplier |
| **Modal** | L1–L2 | ✅ cloud sandbox | ✅ any code | ❌ | ❌ | **No** — supplier |
| **Browser Use** | L2 | ✅ headless browser | ❌ browser-only | ❌ | ❌ | **No** |
| **agent-guardrails** | L3 | ❌ pre-exec hook layer | ⚠️ any shell-access agent | ❌ | ❌ | **No** — a feature, not a plane |
| **Claude Managed Agents** | L2 | ✅ managed + self-host sbx (May 2026) | ❌ Claude only | ❌ | ⚠️ append-only session log (closed) | **No** — single-harness; was "AgentCore (closed beta)" |
| **AgentOps** | L5 | ❌ observability | ✅ instruments any harness | ❌ dashboard | ⚠️ event log, not crypto | **No** — observability |
| **LangSmith** | L5 | ❌ tracing + eval | ✅ | ❌ | ❌ | **No** — observability |
| **specific.dev** | **L1** | ❌ deploy infra, not safety sandbox | ✅ Cursor/Claude Code/Gemini/Aider/Devin/Copilot | ❌ | ❌ | **No** — *different layer* (complement / govern-ee) |
| ~~Signet (Anthropic)~~ | — | — | — | — | — | **UNVERIFIABLE — see §4.6** |

Sources for every new/changed row are in §8. Three correction notes:

1. **"Signet (Anthropic)"** could not be confirmed as an Anthropic product (§4.6).
   Recommend striking or re-sourcing the blueprint row.
2. **"Anthropic AgentCore (closed beta)"** is stale: the current product is **Claude
   Managed Agents** (public beta; self-hosted sandboxes + MCP tunnels added May
   2026). "AgentCore" is also AWS Bedrock's product name — likely a conflation.
3. **Credal "Anthropic only at depth"** is wrong — Credal is multi-model (Claude /
   GPT / Gemini / any MCP surface).

---

## 4. Per-player deep notes

### 4.1 specific.dev — placement, and why it's complementary (not a competitor)

Specific is a "cloud platform built for coding agents": it lets a coding agent both
write code *and* provision/deploy the infrastructure to run it — an `init / dev /
deploy` workflow with managed PostgreSQL, frontend hosting (auto domains, TLS, CDN),
backend services + cron, **secrets & configuration management**, Redis-compatible
cache, S3-compatible storage, and preview environments. It integrates Cursor, Claude
Code, Gemini, Aider, Devin, and Copilot. Founders are ex-Stripe / ex-Fever; backed
by Y Combinator, 20VC, and others (funding amount undisclosed). (specific.dev)

**It has no governance, HITL, safety-isolation, or audit story** — none is surfaced on
its product or about pages. (specific.dev/about) That is the whole point of its
placement: Specific is an **L1 deploy/secrets platform**, the layer *below* AGP.

**Why this matters for AGP.** Specific is the canonical example of a tool AGP exists
to *govern*. An agent wired to Specific can spin up databases, hold secrets, and push
to production — the exact high-blast-radius actions the AGP gate should route to a
Slack approval and write into the signed journal. Far from a threat, Specific is a
**reference integration target** for "what a governed high-privilege deploy tool looks
like." If anything, its rise (more agents provisioning real infra autonomously)
*increases* the demand for an L3/L4 governance plane above it.

### 4.2 Microsoft Agent Governance Toolkit + ACS — the game-changer

Released 2026-04-02. Two artifacts:

- **Agent Governance Toolkit (AGT)** — open source, **MIT-licensed** (note: MIT, not
  AGP's Apache-2.0), Microsoft-signed, in public preview. Tagline: *"Policy
  enforcement, zero-trust identity, execution sandboxing, and reliability engineering
  for autonomous AI agents. Covers 10/10 OWASP Agentic Top 10."* It **intercepts tool
  calls at the middleware layer before execution** for deterministic control, with a
  declarative YAML policy API whose actions include **allow / deny / require_approval /
  sandbox** — e.g. the documented rule *"Destructive operations require human
  approval."* Multi-language (Python, TS, .NET, Rust, Go). (github.com/microsoft/agent-governance-toolkit;
  microsoft.github.io/agent-governance-toolkit)
- **Agent Control Specification (ACS)** — *"an open, vendor-neutral standard that
  defines how runtime governance is applied across the agent lifecycle, independent of
  framework, runtime, or policy engine,"* with a portable manifest and a reference
  implementation. Governance model = 8 lifecycle interception points
  (`agent_startup`, `input`, `pre_model_call`, `post_model_call`, `pre_tool_call`,
  `post_tool_call`, `output`, `agent_shutdown`); policy is Rego/OPA evaluated against a
  canonical snapshot; spec verdicts are **allow / warn / deny / escalate**.
  (commandline.microsoft.com/agent-control-specification-runtime-governance)

**This is the §8.5 hyperscaler answer, and it's bigger than §8.5 imagined.** §8.5
asked about a hyperscaler tool "about to be GA'd as a managed service." Microsoft did
something more strategically pointed: it shipped an **open-source** toolkit *and
published the portable runtime-governance spec itself.* That lands directly on the
ground AGP's Q5 decision deliberately deferred ("no public RFC at v0"; community-
temperature sequencing through v0.7). The premise behind AGP's category-authorship
caution — that no one had yet published a portable runtime-governance spec — is **now
false.** ACS is that spec, from Microsoft, MIT-licensed, with a reference impl.

**Audit — the honesty-critical nuance.** AGT's audit is **not** "merely tamper-evident."
Its `FileAuditSink` does **append-only SHA-256 Merkle hash-chaining AND HMAC signing**
— *"Every entry is HMAC-signed and hash-chained."* (microsoft.github.io/agent-governance-toolkit/tutorials/04-audit-and-compliance)
So AGP must **not** claim "Microsoft only has a tamper-evident log; we sign and chain."
That would be false and would violate AGP's own honest-claims discipline. The genuine,
defensible distinction is narrower and real: **HMAC is symmetric** (shared-secret) —
verifying the log requires holding the secret. **AGP uses Ed25519 asymmetric signing
with a published public key** (`src/config.ts`: `journal-ed25519.pub`, "used for
offline verification (no private key)"), so a third party can verify the chain
*without* being trusted with a signing secret. The honest claim is "**publicly /
independently verifiable signatures**," not "they don't sign."

A second honesty contrast cuts in AGP's favor on *marketing*, not mechanism: Microsoft's
own docs homepage uses *"tamper-evident records"* language — a term AGP's
`MARKETING_CLAIMS.md` **bans at v0**. AGP's allowed claim is the narrower "signed audit
log of every tool call." That discipline is a positioning asset against a field
(Microsoft included) that reaches for stronger assurance words than the primitives
strictly earn.

**What AGT/ACS does NOT do** (the surviving AGP differentiation): no Slack-native (or
any chat-native) HITL surface — its human path is generic "approval workflows with
quorum logic"; no per-harness "sprite" adapter model (its agnosticism is spec-level,
not a Claude-sprite/Codex-sprite architecture); and it is framed for multi-team
enterprise (EU AI Act / HIPAA / SOC2 compliance grading), **not** a single-operator
self-host. (See §5 for whether those hold up as a wedge.)

### 4.3 Runtime (YC P26) — the closest same-span competitor

Runtime is the entrant that should reorder AGP's threat ranking. It self-describes as
*"sandboxed coding agents with your company's context, integrations, and guardrails"*
and ships, in one product, nearly the entire AGP property set:

- **Sandbox (L2):** pre-warmed isolated environments orchestrated across E2B / Daytona
  / EC2 / self-hosted Kubernetes; millisecond snapshots of full dev stacks (Docker
  Compose, Kafka, Redis). (runtm.com; news.ycombinator.com/item?id=48225040)
- **Governance/HITL (L3):** spend limits, file rules, command allow/deny lists, network
  egress controls, RBAC scoped per-human and per-agent, secrets via a managed proxy
  never exposed to agents, and **"production writes happen only through reviewed actions
  or pull requests, so the agent never edits live systems on its own."** (runtm.com)
- **Slack-native HITL:** **@mention agents in Slack** (also web, CLI, Linear, GitHub,
  Jira, Asana, Teams, API). (runtm.com)
- **Audit (L4):** sessions, traces, audit logs, spend — though **signing / hash-chaining
  is not claimed** in any source found.
- **Multi-harness:** Claude Code, Cursor, OpenAI Codex, GitHub Copilot, Gemini CLI,
  Devin, OpenCode. (runtm.com)
- **License:** open-source core with a split Apache-2.0 / MIT / AGPLv3 model; hosted at
  app.runtm.com with a free tier. (news.ycombinator.com/item?id=48225040)

This is the OSS + sandbox + Slack-native HITL + multi-harness combination the blueprint
treated as AGP-unique. **Runtime holds ~3.5 of the four properties** — the only soft
spot is the audit property: it advertises "audit logs," not a *signed, publicly
verifiable, hash-chained* journal. AGP's defensible edge against Runtime is therefore
**narrow and specific**: the depth and verifiability of the audit kernel (Ed25519,
JCS, and hash chaining, lifted from CCSC's 986-test substrate), plus the single-operator
ergonomics and the honest-claims discipline. Runtime is VC-backed and hosted-first;
AGP is single-operator and self-host-first. Those are different buyers — but the
overlap is real and Runtime is now the **#1 competitor to monitor**, ahead of Credal
and Speakeasy.

### 4.4 Credal — repositioned to enterprise multi-agent control plane

Credal now markets *"Build, govern, and deploy enterprise AI agents and MCP servers …
subject to enterprise controls,"* with an Agent Registry (multi-agent collaboration),
**multi-model** support (Claude / ChatGPT / Gemini / any MCP-compatible surface),
permission-syncing from 50+ systems, RBAC, configurable HITL approval gates, full
prompt/response/tool-invocation traceability, and SOC 2 Type 2 / GDPR / CCPA.
(credal.ai)

Two takeaways: (1) it **corrects the blueprint** — Credal is *not* "Anthropic only at
depth"; it is multi-model. (2) It moved **upmarket** — Slack is one of 50+ connectors,
not the primary surface, and the buyer is enterprise security/IT, not a Slack-native
dev team. That makes Credal a *less* direct competitor to AGP's v0 persona than the
blueprint feared, while remaining a real long-run threat in the enterprise lane AGP
defers to v0.8+.

### 4.5 agent-guardrails (OSS) — a feature, not a plane

MIT-licensed, Bash, *"hard policy enforcement for AI coding agents — prevent destructive
terraform, database, k8s, and cloud commands."* Three-layer defense: deny rules in
`settings.json`, pre-execution hook scripts that block on exit code 2, and natural-
language instructions; blocks Terraform `destroy`, `DROP DATABASE`, k8s namespace
deletes, cloud termination, protected-branch force-push. (github.com/roboticforce/agent-guardrails)

It is an L3 *command-blocking hook*, not a governance plane: no Slack HITL, no signed
journal, no sandbox. Useful two ways for AGP: as a "minimum-viable guardrail" contrast,
and because **its own docs argue "human approval alone is insufficient"** (people
approve commands they don't understand) — a sharp adversarial point AGP's HITL design
rationale should address head-on (the answer: approval *plus* a signed record *plus*
sandbox isolation *plus* policy defaults, not approval alone).

### 4.6 Corrections to the blueprint's matrix (Signet, AgentCore)

- **"Signet (Anthropic)" — unverifiable.** No Anthropic product named "Signet" (claim
  attestation, no runtime) could be found. The "Signet" hits are unrelated third
  parties (agentsignet.com; getsignet.xyz). What *is* current from Anthropic in the
  identity/attestation space (2026) is **Workload Identity Federation** for the Claude
  API (OIDC, no static keys) and a "Zero Trust for AI Agents" framing. **Recommend**
  the council/owner strike the Signet row or re-source it; do not carry an unverifiable
  competitor claim forward.
- **"Anthropic AgentCore (closed beta)" — stale + possibly conflated.** The current
  Anthropic product is **Claude Managed Agents**, in **public** beta, which in May 2026
  added **self-hosted sandboxes** (run tool calls on your own infra / Cloudflare /
  Daytona / Modal / Vercel) and **MCP tunnels**. It is still Claude-only with an
  append-only session log. Separately, **"AgentCore" is AWS Bedrock's product name** —
  the blueprint row may conflate the two. **Recommend** relabel to "Claude Managed
  Agents (public beta)" and, if an AWS row is wanted, add "AWS Bedrock AgentCore"
  distinctly.

---

## 5. Strategic read — does the four-property wedge still hold?

**Short answer: yes, but it has narrowed, and the reason it holds is no longer "no one
else combines these four." It's the *depth + verifiability of the audit kernel* and the
*Slack-native HITL ergonomics*, on a single-operator OSS posture.**

### 5.1 What's now contested

- **The generic policy gate (L3) is commoditizing.** Microsoft (ACS/AGT), Runtime,
  Credal, agent-guardrails, and framework-native guardrails (OpenAI Agents SDK,
  LangChain) all offer allow/deny/approve-before-execution. "We gate every tool call"
  is no longer differentiating on its own.
- **The full four-property combination is no longer unheld.** **Runtime** holds ~3.5 of
  4 and is the same span (L2–L4, OSS, Slack-native, multi-harness). The blueprint's
  central claim — "no competitor holds all four" — is *still literally true* (Runtime's
  audit isn't a signed/chained journal; Microsoft has no Slack HITL), but the margin is
  thin and shrinking, and the honest framing is "AGP is the only one with a *publicly
  verifiable signed-audit* full stack," not "AGP is the only one combining these."

### 5.2 What's still defensible

- **Publicly verifiable signed audit (L4 depth).** Ed25519 + JCS + hash chain with a
  published public key for offline third-party verification — stronger than Microsoft's
  symmetric HMAC and absent from Runtime's "audit logs." This is the sharpest surviving
  edge, and it rides on CCSC's 986-test substrate (`003-AA-AUDT`).
- **Slack-native HITL as a first-class surface** (not a connector, not a generic
  approval-workflow). Microsoft has no chat-native surface; Credal treats Slack as 1 of
  50+. Runtime *does* have Slack @mention — so this edge is contested by Runtime
  specifically, defensible against everyone else.
- **Single-operator, self-host-first, honest-claims OSS posture.** Microsoft and Credal
  are enterprise-framed; Runtime is VC/hosted-first. AGP's "Jeremy in his truck"
  persona and `MARKETING_CLAIMS.md` discipline are a genuinely different product
  posture — and the claims discipline is a credibility asset in a field reaching for
  "tamper-evident" / "compliance-grade" language.

### 5.3 The Microsoft question — the two locked decisions this pressures

Microsoft publishing ACS is the event that most pressures AGP's strategy. It pressures
**two** council-locked positions (analysis only — the council decides):

1. **Q5 / §3 "no public RFC at v0."** The rationale rested partly on "category
   authorship is earned through shipped primitives, not press cycles" and an implicit
   "the spec ground is still open." Microsoft has now **authored the portable
   runtime-governance spec** under a neutral, MIT-licensed banner with Microsoft's
   distribution behind it. The *security* leg of the Q5 rationale is unchanged and
   still decisive — AGP's Gateway protocol still has the unfixed SESSION_TOKEN
   confused-deputy hazard (cannon-2), and you cannot publish a wire format with a known
   unfixed attack. So **Q5's conclusion likely survives** (don't rush a broken spec to
   chase Microsoft), but the *premise* that the spec ground is open is gone, and one
   live option is worth council attention: **adopt/profile ACS rather than author a
   rival spec** — i.e. position AGP as "an opinionated, Slack-native, signed-audit
   *implementation* (and possibly a conformance profile) of ACS," turning Microsoft's
   spec into AGP's distribution tailwind instead of a competing standard. That reframes
   the §3 protocols around ACS interception points instead of a bespoke surface.
2. **"Credible OSS reference implementation of the four-property combination" as the
   wedge (§1 of the blueprint).** With Microsoft shipping an OSS reference impl of the
   gate+audit layers and Runtime shipping an OSS full-span product, "be the credible OSS
   reference implementation" is no longer sufficient by itself. The wedge has to narrow
   to the *verifiable* signed-audit + Slack-native HITL + single-operator combination
   (§5.2). This is a sharpening of the wedge, not a refutation — but it is a real change
   from the blueprint's framing and the council should see it.

### 5.4 Honest threat ranking (revised from the blueprint)

| Rank | Player | Why | Blueprint rank |
|---|---|---|---|
| 1 | **Runtime (YC P26)** | Same span (L2–L4), OSS, Slack-native, multi-harness; only the audit-verifiability leg is softer | not listed |
| 2 | **Microsoft AGT / ACS** | Authored the spec AGP deferred; OSS gate+signed-audit; hyperscaler distribution. Not Slack-native, symmetric signing | not listed |
| 3 | **Credal** | Multi-agent enterprise control plane; deep compliance — but upmarket, not Slack-native | "closest on Slack + audit" |
| 4 | **Speakeasy** | Multi-harness orchestration; a Slack adapter is a sprint away | "highest-priority to monitor" |
| 5 | **OpenHands** | Closest OSS on sandbox; community could add HITL/audit | "closest open-source" |

---

## 6. Recommendations

**These are recommendations. Locked decisions (Q1–Q5 in `001-AT-DECR`) are the
council's to change, not this doc's. The blueprint (`002-PP-PLAN`) and the foundation
docs are frozen — the corrections below are proposed, not applied.**

**Monitor (no decision needed):**

- **Runtime** monthly — it is the #1 same-span competitor. Watch specifically whether it
  ships a *signed/hash-chained* audit journal; if it does, AGP's sharpest edge erodes.
- **Microsoft ACS** version cadence and whether AGT adopts ACS as its policy language
  (announced direction). Watch for an ACS conformance/profile mechanism AGP could adopt.
- **specific.dev** as a *reference integration / govern-ee target*, not a threat.

**Flag for an ISEDC council revisit (council decides):**

1. **Revisit Q5 in light of ACS** — not to reverse "no broken spec at v0" (the security
   leg holds), but to decide whether AGP should **adopt/profile ACS** rather than author
   a rival Gateway spec, and whether the §3 protocol surfaces should be reframed around
   ACS's 8 interception points. This is a genuine strategic fork the blueprint's framing
   predates.
2. **Re-examine the wedge statement** (§1 of the blueprint) — narrow it from "credible
   OSS reference implementation of the four-property combination" to the *publicly
   verifiable signed-audit + Slack-native HITL + single-operator* combination, since the
   broad version is now contested by Microsoft + Runtime.
3. **Approve three factual corrections to the §7 matrix** (Signet unverifiable;
   AgentCore → Claude Managed Agents; Credal multi-model) — recorded here, applied only
   on council/owner sign-off given the foundation-doc freeze.

**What NOT to change:**

- **Q4 (honest threat model + `MARKETING_CLAIMS.md`).** The Microsoft "tamper-evident"
  marketing vs primitives gap *validates* this discipline. Do not loosen it. In
  particular, do **not** start claiming "we sign and chain, they only tamper-evident" —
  that's false (Microsoft chains + HMAC-signs); the correct, narrower claim is "publicly
  verifiable signatures."
- **Q1 (OSS-first + Apache-2.0), Q2 (2-week v0 scope), Q3 (Jeremy-then-small-teams).**
  Nothing in this refresh pressures these. Runtime's AGPL/MIT/Apache split and
  Microsoft's MIT are data points for the open-license thesis, not against it.
- **The security gates** (Unix-socket-only Gateway at v0; no public surface until
  Epics 03/05/09/10/11 defensible). Microsoft's pace is not a reason to ship a broken
  auth surface.

**The compliance / demand clock — corrected.** The blueprint research line "EU AI Act
full enforcement opens 2026-08-02" is **imprecise** and should not be repeated as
written. Under the 2026 **AI Omnibus** (provisional agreement May 2026; formal adoption
expected ~July 2026 — verify against the Official Journal before relying on it),
**high-risk obligations were deferred**: stand-alone Annex III high-risk → **2 December
2027**; product-embedded → 2 August 2028. What is actually live on **2 August 2026** is
**Article 50 transparency** + the **AI Office's enforcement/fine powers** (GPAI fines to
3% of global turnover, applicable since Aug 2025). The honest demand-driver framing is
therefore: *Aug 2026 turns on transparency + enforcement machinery; the real high-risk
catalyst — Article 12 logging/traceability and Article 14 human oversight, which map
almost one-to-one onto AGP's signed-tool-call journal and HITL gate — is an **18-month
runway to December 2027**.* That is a tailwind that rewards AGP's "ship defensible
primitives, no analyst deadline" cadence, not a reason to rush.

---

## 7. Answer to blueprint §8.5

> §8.5: *"Are there competitors we haven't named? Specifically: any closed-beta startup
> in the YC / a16z / Founders Fund 2026 cohort doing agent governance? Any internal tool
> at a hyperscaler (AWS, Google, Microsoft) that's about to be GA'd as a managed
> service?"*

**Yes — three, plus corrections:**

1. **Hyperscaler (the big one): Microsoft.** Not a soon-to-GA internal managed service,
   but something more strategically pointed — Microsoft shipped the **Agent Governance
   Toolkit (open source, MIT) + the Agent Control Specification (a published, vendor-
   neutral runtime-governance spec)** on 2026-04-02. This directly occupies the
   spec-authorship ground AGP's Q5 deferred. (§4.2, §5.3)
2. **YC cohort: Runtime (YC P26).** An OSS, sandboxed, Slack-native, multi-harness
   coding-agent platform with HITL + audit logging — the **closest same-span competitor
   AGP has**, ahead of the blueprint's named threats. (§4.3, §5.4)
3. **Also new:** **agent-guardrails** (MIT OSS command-blocking layer); **Credal's
   reposition** to a multi-agent, multi-model enterprise control plane. (§4.4–4.5)
4. **Not a competitor:** **specific.dev** — an L1 deploy platform *below* AGP;
   complementary, a govern-ee. (§4.1)
5. **Corrections:** "Signet (Anthropic)" is **unverifiable** (recommend strike/re-source);
   "Anthropic AgentCore (closed beta)" is **stale** → "Claude Managed Agents (public
   beta)," with a possible AWS-Bedrock-AgentCore conflation. (§4.6)

The wedge still holds, but narrowed: the defensible core is now **publicly verifiable
signed audit + Slack-native HITL + single-operator OSS posture**, not the bare
four-property combination. (§5)

---

## 8. Sources

All URLs accessed 2026-06-04. Items the research could not verify against a primary
source are flagged in-text as UNVERIFIED.

**Microsoft AGT / ACS**
- https://github.com/microsoft/agent-governance-toolkit
- https://microsoft.github.io/agent-governance-toolkit/
- https://microsoft.github.io/agent-governance-toolkit/tutorials/04-audit-and-compliance/
- https://commandline.microsoft.com/agent-control-specification-runtime-governance/
- https://opensource.microsoft.com/blog/2026/04/02/introducing-the-agent-governance-toolkit-open-source-runtime-security-for-ai-agents/

**specific.dev**
- https://specific.dev/
- https://specific.dev/about

**Runtime (YC P26)**
- https://www.runtm.com/
- https://www.ycombinator.com/companies/runtime
- https://news.ycombinator.com/item?id=48225040

**Credal**
- https://www.credal.ai/

**agent-guardrails**
- https://github.com/roboticforce/agent-guardrails

**Anthropic (Claude Managed Agents; identity/attestation)**
- https://www.anthropic.com/engineering/managed-agents
- https://the-decoder.com/anthropic-adds-self-hosted-sandboxes-and-mcp-tunnels-to-claude-managed-agents/
- https://securityboulevard.com/2026/06/anthropic-workload-identity-federation-what-it-gets-right-and-what-it-still-doesnt-solve/

**EU AI Act + 2026 AI Omnibus**
- https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai
- https://artificialintelligenceact.eu/article/12/
- https://artificialintelligenceact.eu/article/14/
- https://www.helpnetsecurity.com/2026/04/16/eu-ai-act-logging-requirements/
- https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/
- https://www.globalpolicywatch.com/2026/05/eu-ai-act-update-timeline-relief-targeted-simplification-and-new-prohibitions/

**AGP internal grounding (not edited by this doc)**
- `000-docs/001-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md` (Q1–Q5 locks)
- `000-docs/002-PP-PLAN-agp-master-blueprint-2026-05-27.md` (§7 matrix, §8.5 question)
- `000-docs/003-AA-AUDT-agp-operator-audit-2026-05-27.md` (CCSC substrate; 986 tests)
- `src/config.ts` (Ed25519 journal signing + published public key for offline verify)

---

*End of competitive landscape refresh. This document is analysis input for the
owner / ISEDC council; it recommends, and changes nothing that is locked.*
