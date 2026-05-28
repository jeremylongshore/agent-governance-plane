---
title: AGP Cannon Adversarial Review — 4-Agent Output Summary
date: 2026-05-27
source: ~/.claude/skills/exec-decision-council/sessions/2026-05-27-agp-strategic-direction/inputs/cannon-summary.md
role: Pre-council adversarial input that pressure-tested AGP synthesis v1 and produced v2 (which the council adjudicated)
status: archived (for third-party review provenance)
---

# Cannon Adversarial Review — 4-Agent Output Summary

Four adversarial agents pressure-tested AGP synthesis v1. Their verdicts informed synthesis v2. The ISEDC council read these verdicts as input before deliberating the 5 strategic questions (see `006-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md`). This document is copied into `000-docs/` so that the full provenance chain (cannon → synthesis v2 → council → AT-DECR) is git-tracked and ships in the third-party review package.

The four cannon agents:

1. **Architect** (Lamport / Helland energy) — distributed-systems trust-boundary critique
2. **Security** (Schneier / Tait energy) — cryptographic-claim and threat-model critique
3. **Product Critic** (Fried / DHH energy) — scope and product-market-fit critique
4. **Market Analyst** (brutal mode) — TAM, GTM, and competitive-moat critique

## Cannon 1: Architect (Lamport / Helland energy)

- Trust boundaries are wrong — only 2 real ones (human→sprite, sandbox→control-plane). The "4-layer" model is runtime topology, not trust model.
- Three protocols pretend partitions don't exist. CP vs AP question never answered. Sprite-restart mid-session forks the audit chain silently.
- Audit chain proves "the signer asserted this" — NOT cross-chain causality, NOT freshness, NOT snapshot-read. The Bob-approved-alice's-op scenario can't be cryptographically attested across two journals.
- Slack-as-audit conflates projection with truth. CCSC ALREADY learned this lesson (see CCSC's CLAUDE.md). v1 regressed.
- Mode 4 (coordinated pair via git) is 2PC in disguise. Git is optimistic concurrency on blobs, not a coordination primitive. Two agents racing on `main` → silent loser.
- 3-env-var sandbox leaks at every I/O boundary: LLM context reconstruction, human stdin, large file uploads each add sub-protocols v1 ignored.

## Cannon 2: Security (Schneier / Tait energy)

- The sandbox's `SESSION_TOKEN` is a bearer credential. Prompt-injected agent does `curl $CONTROL_PLANE_URL/journal/append -H "Authorization: Bearer $SESSION_TOKEN"` → operator's Ed25519 key signs attacker-authored entries. The signature becomes a LIABILITY (confers nonrepudiation to garbage).
- Ed25519 protects against approximately nobody. It does NOT exclude: rooted control plane, leaked SOPS age key, /proc/$pid/mem read, CI deploy key, malicious operator, signing-oracle tricks. "Cryptographically signed" is marketing-grade, not forensic-grade.
- Slack HITL has zero device binding. Phisher with Bob's Slack session forges approval; log says "Bob approved" with no way to distinguish. Needs WebAuthn / passkey at approval time.
- Multi-tenant tenancy is the WHOLE isolation story; one missed check = cross-tenant compromise. Requires per-tenant signing keys (not one process-global key).
- SandboxProvider silently widens TCB. E2B/Modal adapter = those vendors are inside the trust boundary; v1 didn't say so.
- BYOK proxy = control plane is signing its own audit. The operator can siphon Alice's LLM tokens and forge journal entries omitting them. Self-signing auditor is structurally unsound.
- No sprite identity story. Trivial supply-chain spoof: anyone publishes "claude-code-sprite" lookalike, registers Slack app with same name, intercepts.
- Only ~40% of CCSC code survives multi-tenant lift-and-shift. `server.ts` MCP-stdio model dies. Per-tenant rework needed on `gate()`, `journal.ts`, `audit-key-loader.ts`, `nonce-hitl.ts`, `policy.ts`, `stream-reply.ts`, `supervisor.ts`.

## Cannon 3: Product Critic (Fried / DHH energy)

- 90-day v0 is fantasy. Honest one-engineer estimate for v1's scope: 9-15 months.
- Three RFCs at v0 = self-inflicted wound. Zero adopters shaping the design = zero learning before the spec is fossilized.
- Multi-harness in v0 is theater. One sprite (Claude Code) exists. "Multi-harness support" without a second sprite is a slide.
- Two sandbox adapters = two test matrices. Firecracker alone is a week of yak-shaving. Ship Docker only.
- Three collaboration modes = three products. Spectator works; Co-pilot needs turn-taking baton + lock semantics; Coordinated-pair needs git-coordination policy. Ship Spectator only.
- Compliance pitch is v3 marketing. Selling SOC2 to enterprise requires SOC2 itself ($30-80k + 6-12mo) + MSAs + sales motion. Jeremy has never sold to enterprise.
- Hosted vs self-hosted is a v1 question. v0 = whatever Jeremy runs on his own VPS for his own use.
- Differentiation won't survive contact. Funded incumbents can ship "Slack + audit + HITL" in a sprint. Only defensible thing is the cryptographic audit chain itself.
- Real CCSC reuse: ~5k of 12k LoC. Plan accordingly.
- Actual v0 = 1 week of work. "Jeremy in his truck wants Claude Code to fix a bug, with Slack approval + signed log." One named persona, one specific outcome.

## Cannon 4: Market Analyst (brutal mode)

- Buyer confusion is fatal. Synthesis conflates Platform Eng Lead ($50-150k budget, security-conscious) + CISO ($500k+, compliance, slow procurement) + VP Eng ($100-500k, productivity, fast/cheap). Three different products.
- No budget line. "AI agent governance" isn't a 2026 line item. Either displace existing line (DevOps tooling? compliance?) or wait 2-3 years for category emergence.
- Competitive moat is paper-thin. E2B $11M, Modal $16M, Browser Use VC-backed, Anthropic AgentCore unlimited. They'll ship Slack+audit+HITL in 60 days once they notice.
- Compliance is NOT a wedge. Compliance teams buy Drata/Vanta/Secureframe. AGP is at best a data source for one of those products.
- TAM math: 5,000 prod-AI cos × 30% need governance × 80% use Slack × 10% will buy new × 50% can pay $10k+ = **60 customers @ $10k = $600k year-1 TAM**.
- Bottoms-up (dev installs) vs top-down (CISO mandates) GTM are incompatible at v0. Pick ONE.
- Platform-vs-product trap. No network effects = no platform economics. Price as a product per-team.
- Bus factor = Jeremy. Showstopper for enterprise. Open-source it OR onboard a second maintainer before any enterprise pitch.
- Day-90 HN-post scenario: 300 upvotes, 50 comments, 2 serious inquiries, 15 free signups, 0 paid conversions. Day-180: maybe 1 customer @ $2k/mo demanding 30 days of integration work. Day-365: 3 customers @ ~$3-5k/mo = $120k ARR. At $200k burn, runway exhausts month 15.
- Four viable reframes:
  1. **Compliance-only** (CISO, $100k+, SOC2 cert required)
  2. **Sandbox runtime** (head-to-head with E2B, needs $10M+)
  3. **OSS + consulting** (services-business, capped $5M/founder ARR)
  4. **Embed in Anthropic / partner channel** (no direct revenue, ecosystem value)

## v2's response to the cannon

- Scope cut to 1-week "Jeremy in his truck" v0 (Spectator only, Docker only, Claude only, single-tenant, no RFCs)
- Strategic frame: OSS-first + Reframe 3/4 hybrid
- Threat model: honest, label what v0 does NOT defend, no overpromised marketing copy
- CCSC reuse: ~5-6k LoC, not lift-and-shift
- Deferred backlog ladder v0.1 → v1 with explicit triggers per phase
