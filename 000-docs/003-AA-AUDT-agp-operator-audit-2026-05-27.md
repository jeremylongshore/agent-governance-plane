# Agent Governance Plane (AGP): Operator-Grade System Analysis
*Generated: 2026-05-27*
*Substrate version: CCSC v0.10.0 (commit `08b5f2f`)*
*AGP version: pre-build (council ratification + timing amendment 2026-05-27)*
*Scope: hybrid — real audit of the CCSC governance kernel that AGP composes + forward-looking architecture of the AGP composition layer*

---

## 1. This System in 5 Minutes

The **Agent Governance Plane (AGP)** is a Slack-native, OSS-first governance plane for AI coding agents. An operator runs `agp run "fix the bug in repo X"` from a terminal. AGP spawns the chosen agent harness (Claude Code at v0; Codex at v0.1; pluggable thereafter) inside a Docker sandbox, wires the harness's stdout into a Slack thread, posts every tool call the agent attempts (read, write, shell, fetch, git push) into that thread, and prompts an operator with Block Kit Allow / Deny / Details buttons on policy-flagged operations. Every event — request, decision, response — is written into a cryptographically signed, hash-chained audit journal that can be verified offline.

The system AGP composes is not theoretical. The **governance kernel** lives in the `claude-code-slack-channel` repo (CCSC), shipped at v0.10.0 on 2026-05-24 after a 17-PR rollout. CCSC has 986 tests across 17 production TypeScript modules totaling **~11.9k LoC** (live count 11,872 LoC measured 2026-05-28; see §13.4 for the `wc -l` method) of production code, runs as a single-binary Bun process, talks to Slack via Socket Mode, exposes an MCP-stdio surface to Claude Code, and has a battle-tested security boundary model documented in six load-bearing design docs (`THREAT-MODEL.md`, `session-state-machine.md`, `policy-evaluation-flow.md`, `audit-journal-architecture.md`, `bot-manifest-protocol.md`, `ARCHITECTURE.md`).

AGP at v0 is the **multi-harness composition layer** above the CCSC kernel: lift ~5–6k of CCSC's ~11.9k LoC (`crypto.ts`, `journal.ts`, `policy.ts`, `audit-key-*`, `nonce-hitl.ts`, `lib.ts`'s `gate()` core, `peer-bot-rate-limit.ts`, `mute-store.ts`, `stream-reply.ts`), wrap them in a SpriteAdapter interface, replace CCSC's MCP-stdio transport with a Unix-socket Gateway protocol, scaffold a CLI (`agp init` / `agp run` / `agp doctor`), and ship under Apache 2.0 with a hash-pinned MARKETING_CLAIMS.md that gates what we are allowed to promise at each version. The v0 deliverable is a 2-week sprint (1 week core + 1 week onboarding) targeted at Jeremy himself as buyer #1, with small dev teams as the natural adoption population at v0.1+.

Current state, written honestly: CCSC is **production-ready, security-audited at the design-doc level, and feature-frozen for new primitives** through Q3 2026. AGP **does not yet exist as product code** — the repo skeleton at `~/000-projects/agent-governance-plane/` was scaffolded 2026-05-27 with governance dressing (README, LICENSE Apache 2.0, CONTRIBUTING, CI, beads init, 16-epic Phase B plan filed) and is the repo you are reading this doc inside; the implementation work begins after the Epic 00 planning-cleanup beads close. The artifact you are reading is one of four documents (this audit, the master blueprint `002-PP-PLAN-...`, the council decision record `001-AT-DECR-...` with its 2026-05-27 timing amendment, and the cannon adversarial review `004-AR-CANN-...`) constituting a third-party-reviewable pre-build package. The package exists because Jeremy wants outside review before committing the next 6 weeks to AGP.

The biggest risk is **competitive product capture**, not technical execution. Credal, Speakeasy, OpenHands, E2B, Browser Use, Signet, and Anthropic AgentCore each hold 3-of-4 AGP-defining properties (sandbox + multi-harness + Slack HITL + signed audit); none currently hold all four. A well-funded incumbent shipping the missing fourth property in a sprint (~2–4 weeks) collapses AGP's wedge. Phase B's response is to ship defensible primitives in the 16-epic plan — NOT to chase an analyst-relations deadline. (An earlier version of this paragraph cited a 6-week-to-demo cadence calibrated against the Forrester April 2026 Landscape submission window; that framing is rejected by the Phase B controlling change. There is no analyst-driven calendar pacing the build.)

The second-biggest risk is **threat-model overclaim**. AGP's audit chain is signed by the operator's own Ed25519 key against a control plane the operator also runs. That signature is "the signer asserted this," not nonrepudiation, not forensic-grade, not tamper-evident in any compliance-vendor sense. The CISO non-negotiable (MARKETING_CLAIMS.md as code with pre-commit hook + version-gated allowlist) is what holds the line; the allowed v0 claim is exactly "signed audit log of every tool call" — nothing stronger. Any marketing creep is a one-way door because FTC deceptive-practices review takes the same view as a security researcher's HN thread: load-bearing claims are evaluated against load-bearing primitives.

---

## 2. Executive Summary

### What It Does

The CCSC governance kernel (the substrate) bridges a Slack workspace and a Claude Code session over MCP-stdio. Operators talk to Claude in Slack threads; Claude's tool calls are gated by a policy engine that consults a per-channel rule set; permission-required operations surface as Block Kit prompts in the same thread; every decision is journaled to a hash-chained, redacted, optionally signed audit log. The kernel has five defense-in-depth layers (inbound gate, outbound gate, file exfiltration guard, system-prompt hardening, token security) and four runtime dependencies (`@modelcontextprotocol/sdk`, `@slack/web-api`, `@slack/socket-mode`, `zod`) with no framework dependencies.

AGP (the composition above the kernel) generalizes this from "one operator + one Claude Code session in their own Slack" to "one operator running any harness (Claude, Codex, future sprites) in a sandboxed runtime with the same Slack-thread + signed-journal surface." v0 ships single-tenant, Docker-sandboxed, Claude-only. v0.1 adds a second harness through the SpriteAdapter contract (multi-harness validates the abstraction). v0.2 is at most an optional internal-readiness milestone — **not a hosted demo** (the Phase B controlling change drops the demo-first framing). v0.3+ unlocks per-tenant KMS, WebAuthn approval-binding, Firecracker microVMs, Sigstore-signed sprite releases, and (after a 4-phase community-temperature sequencing) public protocol RFCs. No public/demo surface is shipped until the core contracts, audit chain, policy engine, claim-control gate, and runtime (Epics 03, 05, 09, 10, 11) are defensible.

### Operational Status

| Environment | CCSC substrate | AGP composition |
|---|---|---|
| Production | Shipped v0.10.0 (2026-05-24); 17-PR rollout 2026-05-17 → 2026-05-20; 986 tests passing; gates green on `main` | Does not exist yet — pre-build |
| Staging | N/A — CCSC has no staging tier; production = single-operator dogfood | N/A — to be scaffolded as `agp.intentsolutions.io` at v0.2 |
| Local Dev | `bun install && bun server.ts` against operator's own `~/.claude/channels/slack/` state dir | `agp init && agp run "..."` after scaffold |

### Technology Stack (composition surface)

| Category | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Bun (Node.js fallback) | 1.x | Single binary, fast TS execution |
| Language | TypeScript (strict) | 5.x | Type-safety at security boundaries |
| MCP transport (CCSC) | `@modelcontextprotocol/sdk` | latest | Claude Code ↔ kernel stdio bridge |
| Gateway transport (AGP) | Unix socket (v0) / HTTP+Bearer with DPoP (v0.3+) | — | Sandbox ↔ control plane |
| Slack | `@slack/web-api` + `@slack/socket-mode` | latest | Channel layer |
| Schema validation | `zod` | latest | Policy + manifest schemas |
| Sandbox | Docker (v0) → Firecracker (v0.3+) → SandboxProvider interface (v1+) | — | Agent isolation |
| Signing | Ed25519 + JCS via Bun crypto + per-tenant KMS at v0.3+ | — | Audit-chain authenticity |
| Secrets at rest | SOPS + age | — | Encrypted state on disk |
| Test framework | `bun:test` + hand-rolled Gherkin runner | — | 986 tests covering security primitives |
| Static gates | Biome lint, dependency-cruiser, Stryker mutation, custom CRAP score | — | Pre-merge quality enforcement |

---

## 3. Architecture

### 3.1 Stack (detailed)

| Layer | Technology | Version | Purpose | Why this |
|---|---|---|---|---|
| Channel | Slack Socket Mode | latest | Operator-facing thread UI; Block Kit approval prompts | Already-installed daily-tool surface; Block Kit for AI Agents shipped May 2026; CCSC has shipped this layer for 6+ months with the security-boundary lessons baked in |
| Sprite | Per-harness adapter (CCSC's `server.ts` pattern) | n/a | Wrap one harness's stdio/IPC | A SpriteAdapter interface lets a third party write a Codex / Aider / OpenHands sprite without forking AGP |
| Sandbox | Docker (v0) → Firecracker microVM (v0.3+) → SandboxProvider (v1+) | — | Isolate agent execution from host | Docker is honest about its weakness (namespace isolation, not VM-grade); Firecracker is the gold standard at v0.3+ once first security audit happens; SandboxProvider interface keeps the operator choosing |
| Control plane | Bun process (CCSC's `server.ts` rewritten for HTTP+Bearer at v0.3+) | — | Holds creds, runs `gate()`, signs journal, posts to Slack | Single binary, single state dir, single-writer file model. The operator owns it. |
| Signing | Ed25519 + JCS, per-tenant KMS at v0.3+ | — | Audit-chain authenticity | Ed25519 is small, fast, well-implemented in Bun. JCS canonical serialization eliminates whitespace-attack class. |
| Storage | Files in `~/.agp/` (CCSC pattern: `0o600` files, `0o700` dirs, single writer) | — | State persistence | No DB at v0. State is small (audit log + access.json + session JSON). Single-writer model is what makes the hash chain provably linear. |

### 3.2 System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  OPERATOR DEVICE (laptop, truck cab, VPS shell)                 │
│                                                                 │
│   $ agp run "fix the bug in repo X"                             │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────────────────────────────────────┐               │
│   │ AGP DAEMON (single Bun binary)              │               │
│   │  - Slack client (Socket Mode)               │               │
│   │  - Holds operator creds (Slack bot token,   │               │
│   │    GH token); the Claude sprite reuses the  │               │
│   │    operator's existing Claude Code session  │               │
│   │    (claude.ai login) — NOT an API key       │               │
│   │  - Holds Ed25519 signing key (SOPS+age)     │               │
│   │  - Runs gate() against every tool call      │               │
│   │  - Writes signed events to ~/.agp/audit.log │               │
│   │  - Posts policy decisions into Slack thread │               │
│   └─────────────────────────────────────────────┘               │
│         │                       │                               │
│         │ Gateway protocol      │ Slack chat.postMessage        │
│         │ (Unix socket at v0)   │                               │
│         ▼                       ▼                               │
│   ┌─────────────────┐    Slack WebSocket / HTTPS                │
│   │ DOCKER SANDBOX  │           │                               │
│   │  - Claude Code  │           │                               │
│   │  - AGP_GATEWAY_ │           │                               │
│   │    SOCK env var │           ▼                               │
│   │  - tool calls   │   ┌──────────────────┐                    │
│   │    hit gateway  │   │ SLACK WORKSPACE  │                    │
│   │  - holds NO     │   │  - thread        │                    │
│   │    creds        │   │  - Block Kit     │                    │
│   └─────────────────┘   │  - operator      │                    │
│                         │    (the human)   │                    │
│                         └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

The above is the **v0 topology**. At v0.3+ the Gateway transport becomes HTTP+Bearer (with DPoP / mTLS), the sandbox can be a remote Firecracker microVM, and the control plane can run on a different host from the operator's terminal.

### 3.3 The critical path

A single tool call from agent decision to journaled, Slack-acknowledged completion:

```
1. Agent (in Docker sandbox) decides to run `git push --force`.
2. Agent emits a tool-call request over its stdio.
3. SpriteAdapter (in AGP daemon) intercepts the request, converts to Gateway-protocol message.
4. Gateway-protocol message arrives at control plane over Unix socket.
5. Control plane consults policy.ts → gate() against (operator-id, channel-id, tool-name, args).
6. gate() returns one of: allow | deny | require-approval | quarantine.
   ├─ allow: control plane writes ALLOW event to journal.ts, signs with Ed25519, returns ALLOW to sandbox.
   ├─ deny: control plane writes DENY event, signs, returns DENY (agent sees error). Slack receives projection.
   ├─ require-approval: control plane writes REQUIRE event, signs, posts Block Kit prompt into Slack thread.
   │                    Sandbox blocks awaiting verdict. nonce-hitl.ts generates fresh nonce per prompt.
   │                    Operator clicks Allow/Deny in Slack. Slack interactivity webhook hits control plane.
   │                    Control plane validates nonce, writes APPROVED/DENIED event, signs, returns to sandbox.
   └─ quarantine: control plane suspends session, writes QUARANTINE event, posts to Slack with details.
7. Sandbox proceeds (or doesn't) based on verdict. If proceeded, executes `git push --force`.
8. Tool result (stdout/stderr/exit) flows back through Gateway → SpriteAdapter → projected into Slack thread.
9. Final event in chain: RESULT event with redacted output snippet, signed.
```

**Failure points along the path** (each is a v0 limitation marked in code with explanatory comments):

| Step | Failure mode | v0 behavior | Marketing-claim implication |
|---|---|---|---|
| 4 | Gateway message dropped on Unix socket | Sandbox blocks indefinitely (no retry); operator manually terminates session | "v0 does not promise exactly-once tool execution" — must be in README |
| 5 | Policy engine throws | Default-deny (fail closed) per CCSC convention | Documented as fail-closed; safer than fail-open |
| 6 (require) | Slack `chat.postMessage` 5xx | Logged to stderr; retry not implemented at v0; operator sees nothing in Slack and session hangs | "Slack is a projection, not authority" — operator must check local log on suspected hang |
| 6 (require) | Operator never clicks | Timeout at 1h (configurable); session is quarantined; events journaled | Documented limit; operators must know it |
| 7 | Tool execution itself fails (network, disk full) | Agent receives error; control plane journals RESULT-error | Standard error-handling; nothing AGP-specific |
| 9 | Journal append throws (disk full) | Process crashes; partial event NOT written; chain remains consistent | Crash-safety is a property of the file-write model — see `audit-journal-architecture.md` |

### 3.4 Dependency graph

```
agp daemon
├── @modelcontextprotocol/sdk      (CCSC kernel reuse; v0.5+ may decouple)
├── @slack/web-api                 (channel layer)
├── @slack/socket-mode             (channel layer)
├── zod                            (schema validation at every boundary)
└── Docker daemon on host          (sandbox runtime; v0)
    └── Linux kernel namespaces    (the actual isolation primitive)
```

**Build order at v0**: kernel modules first (`crypto.ts`, `journal.ts`, `policy.ts`, `audit-key-*`), then CLI (`agp init / run / doctor`), then SpriteAdapter (after first sprite stabilizes), then channel adapter (after first sprite + first sandbox work together).

**What happens when each dependency is unavailable**:

- Docker daemon down → `agp run` fails at startup with explicit "Docker daemon not reachable" message. No silent fallback. This is correct.
- Slack API 5xx → policy decisions still happen and are journaled; operator just doesn't see them in Slack. Local log remains authoritative.
- `@modelcontextprotocol/sdk` breaking change → CCSC kernel breaks (this is the highest-risk upstream dependency; CCSC pinned in its `bunfig.toml` for this reason; AGP inherits the pin).

---

## 4. Design Decisions & Tradeoffs

### 4.1 Decision log

#### Apache 2.0 over BSL / AGPL / MIT

- **Chosen**: Apache 2.0
- **Over**: BSL (4-year time-bomb to Apache, protects against SaaS strip-mining), AGPL (forces downstream services to open-source), MIT (minimal patent grant)
- **Because**: Patent grant + community-trust signal preferred by the OpenSSF / in-toto / SLSA / SIG-GenAI audience AGP wants to earn standards-body legitimacy with. GC compromise during Q1 council deliberation: Apache 2.0 was the unanimous (7/7) license choice. The OSS-first frame is the wedge; license-novelty would undermine it.
- **Cost**: Cloud vendors can take AGP, rebrand, and offer hosted-AGP without contributing back. (Mitigated by: trademark + hosted plan + consulting motion.)
- **Revisit when**: A specific cloud-vendor strip-mining incident happens and demonstrably costs material revenue. Until then, the OSS-first trust currency is more valuable than the license-rent it would generate.

#### Single-binary Bun process over microservices / serverless

- **Chosen**: Single Bun binary, single state directory, single writer
- **Over**: Multiple microservices (control plane / gate / journal / channel as separate processes), serverless (functions-as-a-service for tool-call gating), in-cluster Kubernetes deployment
- **Because**: The hash chain requires a single writer to be provably linear. Splitting `journal.ts` into a separate service introduces a queue / coordination problem that is the entire content of cannon-1's "audit chain proves the signer asserted this, NOT cross-chain causality" critique. Single binary makes that property trivial.
- **Cost**: Cannot horizontally scale the control plane. A single operator can run hundreds of concurrent sessions on one Bun process; a team running thousands would need v0.3 multi-tenant rewrite and per-tenant journal sharding.
- **Revisit when**: A single-tenant deployment exceeds ~10,000 concurrent sessions or ~1M tool calls/day. Neither limit is plausible at v0 / v0.1 / v0.2.

#### Docker sandbox over Firecracker (at v0)

- **Chosen**: Docker namespace isolation at v0
- **Over**: Firecracker microVM (gold standard), Unikraft (specialized), bare process (no isolation)
- **Because**: Docker is universally installed; the v0 "Saturday-afternoon-developer-tries-the-thing" test fails the moment installation requires a kernel module. Honest about weakness — `THREAT-MODEL.md` documents Docker as "namespace isolation, not VM-grade."
- **Cost**: Sandbox escape via container-runtime CVE is plausible. Mitigation: SandboxProvider interface lands at v0.3+ with Firecracker as the first non-Docker provider.
- **Revisit when**: First security audit conversation happens (per AT-DECR Q4 implementation directive).

#### Unix socket Gateway transport over HTTP+Bearer (at v0)

- **Chosen**: Unix socket, sender-bound to single host
- **Over**: HTTP+Bearer, gRPC over TLS
- **Because**: Cannon-2's SESSION_TOKEN-as-bearer-credential confused-deputy attack: a prompt-injected agent could `curl $CONTROL_PLANE_URL/journal/append -H "Authorization: Bearer $SESSION_TOKEN"` and have the operator's Ed25519 key sign attacker-authored entries, conferring nonrepudiation to garbage. Unix-socket topology makes the attack impractical (no network exposure).
- **Cost**: Cannot run the sandbox on a different host from the control plane. The v0 deployment is single-host only.
- **Revisit when**: Multi-host deployment is asked for. v0.3+ HTTP+Bearer transport REQUIRES sender-constrained tokens (DPoP / mTLS) before going public — per the council Q5 binding constraint, the Gateway-socket interface must fix the SESSION_TOKEN problem BEFORE any RFC is published.

#### Single-tenant at v0, multi-tenant at v0.3 (NOT v0.1)

- **Chosen**: Single tenant. One operator, one workspace, one repo target.
- **Over**: Multi-tenant from day one (compliance shops want this), defer multi-tenant to v0.7+
- **Because**: Multi-tenant requires per-tenant signing keys (KMS), per-tenant HMAC secrets for `nonce-hitl.ts`, per-tenant chain in `journal.ts`, multi-tenant `gate()` rewrite. Cannon-2's "Multi-tenant tenancy is the WHOLE isolation story; one missed check = cross-tenant compromise" makes this a security project, not a feature project. Doing it sloppily at v0 = guaranteed cross-tenant data leak.
- **Cost**: Cannot serve multiple paying customers from one hosted instance until v0.3.
- **Revisit when**: Second self-hoster asks. The threshold is built around real-customer-pull, not vendor convenience.

#### MARKETING_CLAIMS.md as code (CISO non-negotiable)

- **Chosen**: Hash-pinned `MARKETING_CLAIMS.md`, pre-commit hook fails on disallowed claims, version-gated allowlist
- **Over**: Marketing-team-style style guide, post-hoc legal review, no enforcement
- **Because**: Aspirational marketing creates FTC deceptive-practices liability and burns crypto-primitive credibility permanently — the lessons from CCSC's own CLAUDE.md drift section, and confirmed by all 7 council seats including CMO's "tamper-evident headline" compromise. Substance is honest; presentation is SLSA-tiered.
- **Cost**: Marketing copy cycle time is longer. Every new claim requires a deliberate version-tagged commit.
- **Revisit when**: Never. This is structurally one of the load-bearing decisions; reversing it is a strategy change requiring a new council session.

#### Schema-slot reservation at first commit (CISO non-negotiable)

- **Chosen**: `tenant_id`, `signing_key_id`, `approval_binding_type`, `sprite_identity_uri` all present in journal-event schema with `null` values at v0
- **Over**: Add slots when needed; refactor the chain later
- **Because**: Adding a field to a hash-chained journal requires forking the chain (the hash output for "old schema with implicit field absent" diverges from "new schema with explicit field null"). Reserving the slots costs zero at v0 and avoids a one-way door.
- **Cost**: Schema has fields that look unused at v0. README must explain why.
- **Revisit when**: Never — the cost of revisiting is the cost of forking the chain, which is the cost we are paying to reserve them now.

### 4.2 What was deliberately not built

- **No public RFCs at v0**. Cannon-2's SESSION_TOKEN finding is dispositive. CSO 4-phase community-temperature sequencing through v0.7+ instead.
- **No multi-harness at v0**. Cannon-3's "multi-harness without a second sprite is a slide." Validated multi-harness lands at v0.1 (week 4 per timing amendment).
- **No multi-tenant at v0**. Single isolation domain = single threat model = single liability surface.
- **No compliance pitch**. Compliance teams buy Drata/Vanta/Secureframe. AGP is at best a data source for one of those products at v1+.
- **No landing page until v0.2**. Don't market a product that doesn't have a working demo.
- **No HN post until ALL v0 directives ship green**. Per AT-DECR implementation directive: "Posting tone: low-key, 'Slack-side approval prompts for Claude Code with a signed log' — NOT 'we built the agent governance plane.'"
- **No second sandbox runtime at v0**. Docker only. SandboxProvider interface lands at v0.3+.
- **No coordinated-pair collaboration mode at v0**. Cannon-1's 2PC-in-disguise critique. Deferred to v0.9.
- **No BYOK proxy where AGP signs its own audit**. Cannon-2's "self-signing auditor is structurally unsound." When AGP-hosted plan exists at v0.8+, audit signing is operator-owned via per-tenant KMS.

### 4.3 Assumptions the architecture rests on

| Assumption | Threshold |
|---|---|
| Single operator at v0 (no concurrent writers to journal) | True until v0.3 multi-tenant rewrite |
| Docker is installed and the user has rights to `docker run` | True for ~99% of dev environments; explicit precondition in `agp doctor` |
| Slack Socket Mode is reachable from the operator's network | True for residential, mobile-tethered, and most corporate networks; documented in README |
| Operator owns the Ed25519 signing key and accepts that the signature does NOT prove nonrepudiation against themselves | True for self-hosted v0; explicitly stated in `THREAT-MODEL.md` |
| CCSC kernel modules lift to AGP namespace without forking the upstream repo (we'll keep them in sync via cherry-pick or monorepo refs) | Extraction strategy is TBD — Epic 02 (`agp-7ii`) will ADR-pick between vendor / git submodule / path dependency / shared kernel package. AGP scaffolded as its own dedicated repo (`jeremylongshore/agent-governance-plane`), not as a sibling project under a shared workspace. |
| The hash chain's "single writer = provably linear" property is preserved through any future refactoring | True only if `journal.ts` remains a single-process module; splitting it breaks the property |

---

## 5. Directory Structure

### 5.1 Substrate (CCSC) layout

```
claude-code-slack-channel/
├── server.ts                       # Stateful runtime — Slack bootstrap, MCP server, event handlers
├── lib.ts                          # Pure functions — gate(), assertSendable(), assertOutboundAllowed()
├── journal.ts                      # Hash-chained audit log — JournalWriter, verifyJournal, redactor
├── supervisor.ts                   # SessionSupervisor — activate/deactivate/quiesce, idle reaper, quarantine
├── policy.ts                       # Declarative policy engine — evaluate(), detectShadowing, checkMonotonicity
├── manifest.ts                     # Bot-manifest protocol — schema, assertPublishAllowed (CCSC-specific, NOT lifted to AGP)
├── crypto.ts                       # Ed25519 + JCS primitives (lifted as-is)
├── audit-key-loader.ts             # SOPS+age key lifecycle (lifted as-is)
├── audit-key-cli.ts                # Key management CLI (lifted as-is)
├── nonce-hitl.ts                   # HMAC nonces for HITL approval (multi-tenant rework at v0.3)
├── policy-dispatch.ts              # Context-stripping pattern (lifted as-is)
├── stream-reply.ts                 # Slack chat.update streaming (lifted, channel-agnostic refactor at v1+)
├── peer-bot-rate-limit.ts          # Multi-agent coordination guard (lifted as-is)
├── mute-store.ts                   # Per-channel mute state (lifted as-is)
├── admin.ts                        # Generic admin verb dispatcher (lifted as-is)
├── acp-adapter.ts                  # Allow/deny/require-approval adapter (lifted)
├── 000-docs/                       # Design docs (the load-bearing contracts)
│   ├── THREAT-MODEL.md
│   ├── session-state-machine.md
│   ├── policy-evaluation-flow.md
│   ├── audit-journal-architecture.md
│   ├── bot-manifest-protocol.md
│   └── ARCHITECTURE.md
├── features/                       # Gherkin acceptance contracts (Wall 1)
│   ├── *.feature                   # Hash-pinned via .harness-hash
│   ├── runner.ts                   # Hand-rolled Gherkin runner
│   └── steps/                      # Step implementations
├── scripts/                        # Quality gates (coverage, crap, bias, gherkin-lint, harness-hash)
├── server.test.ts                  # 986 tests, primary suite
└── .audit-harness/                 # @intentsolutions/audit-harness vendored install
```

### 5.2 AGP layout (planned, post-scaffold)

```
~/000-projects/agent-governance-plane/
├── src/
│   ├── cli/
│   │   ├── init.ts                 # agp init (interactive setup)
│   │   ├── run.ts                  # agp run "<task>" (the main flow)
│   │   └── doctor.ts               # agp doctor (health check)
│   ├── daemon/
│   │   ├── control-plane.ts        # The Bun process; orchestrates everything
│   │   ├── gateway-server.ts       # Unix socket listener for sandbox-side Gateway calls
│   │   └── sprite-adapter.ts       # SpriteAdapter interface + Claude impl (v0); Codex impl (v0.1)
│   ├── channel/
│   │   ├── slack.ts                # Lifts CCSC stream-reply.ts + slack-specific bits of server.ts
│   │   └── (discord.ts, teams.ts at v0.5+ if reviewed-and-approved)
│   ├── sandbox/
│   │   ├── docker.ts               # v0 sandbox provider
│   │   └── sandbox-provider.ts     # Interface (v0.3+: firecracker.ts, e2b.ts)
│   ├── kernel/                     # Lifted CCSC modules (kept in sync via cherry-pick or monorepo ref)
│   │   ├── crypto.ts
│   │   ├── journal.ts              # Schema-slot-reserved at v0 (CISO non-negotiable)
│   │   ├── policy.ts
│   │   ├── gate.ts                 # Extracted channel-agnostic core of CCSC lib.ts gate()
│   │   ├── nonce-hitl.ts
│   │   ├── audit-key-loader.ts
│   │   ├── peer-bot-rate-limit.ts
│   │   └── mute-store.ts
│   └── manifest/
│       └── slack-app-manifest.ts    # Static manifest exported by agp init (NOT a dynamic protocol)
├── tests/                          # AGP-specific integration tests + lifted CCSC unit tests
├── 000-docs/                       # Threat model, MARKETING_CLAIMS.md, CONTRIBUTING.md
│   ├── THREAT-MODEL.md             # CISO-locked tier table (what v0 defends, what v0 doesn't)
│   ├── MARKETING_CLAIMS.md         # Hash-pinned, CISO veto, allowed-at-vN registry
│   ├── ARCHITECTURE.md             # 4-layer topology, 2 trust boundaries
│   └── DESIGN-NOTES.md             # CMO-compromise design-thinking doc (NOT an RFC)
├── features/                       # AGP-specific Gherkin contracts
├── scripts/                        # Inherits @intentsolutions/audit-harness gates
├── .audit-harness/                 # Vendored harness install (Intent Solutions Testing SOP)
├── CONTRIBUTING.md                 # External-implementer section (per VP DevRel binding constraint)
├── SECURITY.md
├── LICENSE                         # Apache 2.0
├── README.md                       # 5-min Saturday-afternoon-developer quickstart
└── CHANGELOG.md
```

### 5.3 Load-bearing files

| File | Role | Why it breaks everything |
|---|---|---|
| `src/kernel/journal.ts` | Hash chain writer + verifier | Chain integrity is the entire signed-audit story. Any bug here breaks the v0 marketing claim. |
| `src/kernel/gate.ts` | Policy decision procedure | Single point where allow/deny is decided. Bug = security boundary failure. |
| `src/kernel/crypto.ts` | Ed25519 + JCS canonical serialization | Whitespace bug in JCS = chain divergence with no signature error. Subtle and dangerous. |
| `src/daemon/gateway-server.ts` | Sandbox → control-plane boundary | Confused-deputy attack surface; the SESSION_TOKEN bearer-credential hazard lives here. |
| `src/daemon/control-plane.ts` | Orchestrator (single-writer assumption holder) | Splitting this file is what would break the hash-chain linearity. Keep it singular by design. |
| `000-docs/MARKETING_CLAIMS.md` | Source of truth for what AGP is allowed to claim | Hash-pinned; pre-commit hook fails on drift. CISO veto. |
| `000-docs/THREAT-MODEL.md` | Source of truth for what v0 actually defends | Marketing-team reads this before any claim; FTC defense rests on it. |
| `.audit-harness/` | Intent Solutions Testing SOP enforcement | Hash-pinning, escape-scan, CRAP, architecture, bias, Gherkin lint. CI gates on it. |

---

## 6. Getting Started (planned, post-scaffold)

### 6.1 Prerequisites

| Tool | Version | Install | Verify |
|---|---|---|---|
| Bun | 1.x | `curl -fsSL https://bun.sh/install \| bash` | `bun --version` |
| Docker | 24.x+ | https://docs.docker.com/get-docker/ | `docker run hello-world` |
| Slack app | (provisioned via `agp init`) | `agp init` walks through it | Slack app installed in operator's workspace |
| SOPS + age | latest | `~/bin/sops-init` (Jeremy's global bootstrap) | `sops --version && age --version` |
| Claude Code | v2.1.80+ | https://claude.com/code (install per Anthropic's installer) | `claude --version` reports v2.1.80 or newer, AND `claude` is logged in via `claude.ai` (NOT an API key — interactive session auth required, matching CCSC's posture) |

### 6.2 Zero to running

1. `git clone git@github.com:jeremylongshore/agp.git && cd agp` *(repo doesn't exist yet — post-scaffold)*
2. `bun install` — expect "X packages installed" (no warnings on Bun's own dep tree)
3. `agp init` — interactive: walks through Slack app manifest export, signing-key generation (Ed25519 via `audit-key-cli`), Claude Code session verification (confirms `claude --version` ≥ v2.1.80 and that `claude.ai` login is active — NOT an API key check), SOPS dotenv setup, sandbox image pull
4. `agp doctor` — verifies all of the above; outputs PASS / WARN / FAIL per check
5. `agp run "fix the typo in README.md"` — spawns the sandbox, opens the Slack thread, waits for operator approvals

### 6.3 Common setup problems

| Symptom | Cause | Fix |
|---|---|---|
| `agp init` exits at "Slack app manifest creation" with "Slack API 401" | OAuth scopes wrong | Re-run with `--scopes-debug` to see required scopes |
| `agp run` hangs immediately after "spawning sandbox" | Docker daemon not running, or operator not in `docker` group | `sudo systemctl start docker` or `sudo usermod -aG docker $USER && newgrp docker` |
| Signing fails with "key not found" | SOPS-encrypted key not decrypted | `scripts/sops-env` wrapper missing; re-run `~/bin/sops-init` from agp/ |
| Slack thread shows no Block Kit prompts | Socket Mode token wrong | `agp doctor --slack` regenerates the token-validation report |
| `journal.ts` "chain verification failed" | Operator edited audit.log by hand | Don't do that — restore from backup; or accept the chain is broken from event N |

---

## 7. Operations

### 7.1 Command map (planned)

| Task | Command | Notes |
|---|---|---|
| Initial setup | `agp init` | Interactive; idempotent; safe to re-run |
| Run an agent session | `agp run "<task>"` | Foreground; Ctrl-C terminates session and writes SESSION_END event |
| Health check | `agp doctor` | All-green required before public-facing demos |
| Verify audit log | `agp verify ~/.agp/audit.log` | Walks chain end-to-end; reports first divergence if any |
| Export Slack app manifest | `agp slack export-manifest` | Output is paste-into-Slack-admin format |
| Rotate signing key | `agp keys rotate` | Writes a KEY_ROTATION event; old key stays in keyring for verification |
| Inspect session | `agp sessions show <id>` | Pretty-prints the per-session JSON |
| Update policy | `vi ~/.agp/policy.json` then `agp policy validate` | Validates against zod schema before reload |
| Tail Slack-projection log | `agp logs slack-projection -f` | Local-only; useful when Slack 5xx flapping |
| Tail journal | `agp logs journal -f` | The authoritative log; redacted per fixed rules |

### 7.2 Deployment (DEFERRED — no public surface in Phase B v0)

> **Phase B controlling change**: this section was originally a deployment playbook for a v0.2 hosted demo at `agp.intentsolutions.io`. **The hosted-demo goal is dropped.** There is no public deployment in the 16-epic Phase B plan; AGP is operator-only on the operator's own machine through Epic 11. The `agp.intentsolutions.io` namespace remains reserved (Epic 11 / claim-control gates it) but is not standing up any deployment at Phase B v0.
>
> The pre-flight checklist, execution steps, and rollback protocol below are PRESERVED AS HISTORICAL REFERENCE for when a future epic (post-Epic 11, post-Epic 15 release discipline) re-opens the question of a public surface. Treat them as a starting point for that future ADR, not as a current playbook.
>
> Operational reality at Phase B v0: AGP runs on the operator's machine via `agp run`. No VPS deployment. No Caddy block. No basicauth gate. No SLO commitment to anyone.

<details>
<summary>Original v0.2 hosted demo deployment playbook (historical reference; do NOT execute at Phase B v0)</summary>

**Pre-flight checklist** *(original — superseded)*:

- All v0 directives green (per AT-DECR Implementation Directives table)
- `MARKETING_CLAIMS.md` v0.2 entries CISO-approved
- `agp.intentsolutions.io` Caddy block validated (`caddy validate`)
- Basicauth credentials in `pass partners/agp/basicauth-demo` (per partner-portal pattern)
- `/healthz` endpoint anonymous; `/` and `/demo/*` basicauth-gated
- Sandbox image pinned to a specific SHA (not `latest`)

**Execution steps** *(original — superseded; lifted from `intentsolutions-vps-runbook/docs/onboard-new-repo-deploy.md`)*:

```bash
# On the VPS, as the intentsolutions user
sudo -u intentsolutions bash
cd ~/agp
git fetch origin
git checkout v0.2.0
./scripts/deploy.sh    # builds Bun binary, restarts systemd unit
curl -fsS https://agp.intentsolutions.io/healthz   # must return 200 with "ok"
```

**Verification** *(original — superseded)*: healthz / basicauth / demo flow / signed-journal link.

**Rollback protocol** *(original — superseded)*: git checkout v0.1.0 + `./scripts/deploy.sh`.

</details>

### 7.3 Monitoring & alerting (operator-only at Phase B v0)

- **Dashboards**: at Phase B v0, monitoring is whatever the operator runs locally. No shared dashboard. No tailnet endpoint advertised to others. Netdata at `http://intentsolutions:19999` and ntfy at `http://intentsolutions:8080` remain available on the operator's tailnet (per CCSC posture) but are not part of an AGP-specific monitoring story.
- **SLIs at Phase B v0**: tool-call gate latency, journal-write latency, sandbox spawn time — measured locally per session, not aggregated for external visibility.
- **SLOs at Phase B v0**: NONE published. AGP is not a hosted service; it is a CLI/daemon on the operator's machine.
- **On-call**: the operator who ran `agp run` is on-call for that session. No external on-call rotation. No paging anyone else.

### 7.4 Incident response (Phase B v0 — operator-only)

| Severity | Definition | Response time | Playbook |
|---|---|---|---|
| P0 | Sandbox escape suspected; signed journal divergence reported | 15 min (the operator's own time — there is no rotation) | Quarantine session; `agp verify` chain; file `bd` for forensic; consider key rotation |
| P1 | Slack projection delayed > 1 min; operator UX degraded | 1 hour | Check Slack API status; fall back to local log; the local journal is authoritative |
| P2 | Linting / CI / docs drift | Next business day | Standard `/sweep` workflow |

The original §7.4 included a P0 entry for "Production hosted demo returns 5xx" — that scenario is impossible at Phase B v0 because there is no production hosted demo.

---

## 8. Things That Will Bite You

Ordered by likelihood × impact.

### 8.1 The hash chain forks silently on schema additions

- **Symptom**: `agp verify` reports "chain verification failed at event N"; no other error
- **Cause**: A field was added to the journal-event schema after deployment without reserving the slot. Old events hash one way; new events hash another. The chain is broken from event N forward.
- **Fix**: Restore from backup before event N; or accept the chain is broken from event N (mark with a SCHEMA_MIGRATION event signed by the operator)
- **Prevention**: The CISO non-negotiable. All schema slots reserved at first commit with `null` values. NEVER add a new field without a version bump + a SCHEMA_MIGRATION event.

### 8.2 Slack rate-limits cause "operator never sees prompt" sessions to hang

- **Symptom**: Operator sees no Block Kit prompt in Slack; sandbox blocked indefinitely
- **Cause**: Slack rate-limits at 1 message/sec/channel under burst. A noisy session can exceed this.
- **Fix**: Default timeout at 1h auto-quarantines hanging sessions; operator can `agp sessions resume <id>` after rate limit clears
- **Prevention**: `peer-bot-rate-limit.ts` already handles this on the inbound side; outbound projection throttling lands at v0.5

### 8.3 Operator forgets the Ed25519 key is not a forensic-grade primitive

- **Symptom**: Operator markets "tamper-evident audit log" to a customer; customer's security team asks for the threat model; operator scrambles
- **Cause**: Substrate confusion — "cryptographically signed" sounds like "tamper-evident" to a non-security person
- **Fix**: Send the customer the `THREAT-MODEL.md` tier table. Explain the v0 marketing-claim is "signed audit log of every tool call" — nothing stronger.
- **Prevention**: MARKETING_CLAIMS.md as code with pre-commit hook. CISO veto. NEVER skip the hook.

### 8.4 Docker daemon down on operator's laptop

- **Symptom**: `agp run` fails immediately with "Docker daemon not reachable"
- **Cause**: Docker not started; or operator not in `docker` group
- **Fix**: `sudo systemctl start docker` (Linux) or open Docker Desktop (macOS); `newgrp docker` if just added to group
- **Prevention**: `agp doctor` is the standard pre-flight; teach operators to run it before any session

### 8.5 SOPS dotenv eval leak via `export | sed` antipattern

- **Symptom**: `journalctl` (or any captured stdout) shows entire environment including secrets
- **Cause**: Using `eval "$(sops -d ... | sed 's/^/export /')"` — comment lines and blank lines become `export # ...` or bare `export`, and bare `export` dumps every exported variable to stdout
- **Fix**: Use the anchored regex pattern: `eval "$(sops -d ... | sed -nE 's/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/export \1=\2/p')"`
- **Prevention**: AGP must NOT use the unsafe pattern. Use the SOPS env wrapper from `~/bin/sops-init` (already correct). See bd memory `sops-dotenv-eval-leak-2026-05-02` in CCSC's repo.

### 8.6 Sandbox image drift between v0 and v0.1

- **Symptom**: Codex sprite works on the operator's machine but fails on another operator's machine (or in CI)
- **Cause**: Sandbox image pinned to `:latest` instead of a SHA-pinned tag; Docker registry rebuilt the image
- **Fix**: Pin to SHA in `agp config`; rebuild and republish if needed
- **Prevention**: `agp init` writes SHA-pinned image references by default; CI gate verifies no `:latest` references in production config

### 8.7 Claude Code session rate limit / quota exhaustion during a long session

- **Symptom**: Agent stops mid-task with a rate-limit or quota message from the Claude Code client; session quarantines
- **Cause**: The operator's `claude.ai` subscription tier ran into its 5-hour / weekly window or hit a usage limit on the active login session (AGP does NOT hold an Anthropic API key — the Claude sprite reuses the operator's Claude Code login session per CCSC's posture, so quotas inherit from the operator's plan)
- **Fix**: Wait for the session window to reset, or upgrade the operator's `claude.ai` plan; resume with `agp sessions resume <id>` once Claude Code is usable again
- **Prevention**: `agp doctor` reports whether `claude` is logged in and (best-effort) whether a recent usage warning was emitted; warn operators in README that AGP sessions consume their interactive Claude Code quota

### 8.8 Slack workspace owner revokes the AGP app's OAuth grant

- **Symptom**: All Slack `chat.postMessage` calls fail with `invalid_auth`; sessions hang
- **Cause**: Workspace owner uninstalled the app; or rotated the bot token
- **Fix**: Re-run `agp init`; reinstall the app; re-export the manifest
- **Prevention**: Document this risk in CONTRIBUTING.md for hosted-plan operators

### 8.9 The CCSC kernel ships a breaking change in v0.11+

- **Symptom**: AGP fails to build after `bun upgrade @claude-code-slack-channel/kernel`
- **Cause**: CCSC is in active development; v0.10.0 is the latest stable but v0.11+ may rework MCP-stdio
- **Fix**: Pin the kernel reference to a specific CCSC commit SHA in `agp` package.json
- **Prevention**: At AGP v0 scaffolding, the kernel reference is a git submodule or fixed-SHA dependency, not a floating version

### 8.10 Pre-commit hook blocks a hot-fix to MARKETING_CLAIMS.md

- **Symptom**: `git commit` fails with "MARKETING_CLAIMS.md drift detected"
- **Cause**: A README change added a claim not in the version-tagged allowlist
- **Fix**: Either remove the claim, or update MARKETING_CLAIMS.md with the new claim AND get CISO approval AND bump the version tag
- **Prevention**: This is working-as-intended. Honor the hook. Per CISO non-negotiable: never bypass.

---

## 9. Security & Access

### 9.1 Access control (Phase B v0 — operator-only)

| Role | Purpose | Permissions | MFA |
|---|---|---|---|
| Operator (Phase B v0, self-hosted on their own machine) | Run `agp run`, view local logs | Full local FS access on the operator's own machine; owns signing key | Slack workspace SSO/MFA inherits |
| AGP maintainer (Jeremy) | Maintain the OSS repo, cut releases, respond to security reports | GitHub repo admin; signing-key management for releases (when Epic 13 lands) | GitHub MFA + Tailscale for any infra access |

> **Phase B controlling change**: this table originally included a "Hosted-demo visitor (v0.2)" row + a "Forrester analyst (v0.2)" row. Both are removed. There is no hosted demo at Phase B v0 and no analyst-specific access mode. If a future epic opens a public surface, the access-control table is revisited at that epic's ADR.

### 9.2 Secrets

- **Where**: SOPS-encrypted in repo (`secrets.sops.yaml`); decrypted at process start via `scripts/sops-env` wrapper to `/dev/shm` tmpfs
- **Rotation**: Slack bot token quarterly; Ed25519 signing key annually OR on suspected compromise (writes KEY_ROTATION event); no Anthropic API key to rotate at v0 — the Claude sprite reuses the operator's `claude.ai` login session, whose lifecycle is governed by Anthropic's own session-expiry policy and re-auth is handled by `claude` (not by AGP)
- **Emergency access**: at Phase B v0, AGP runs on the operator's own machine and inherits whatever break-glass posture the operator already has. The Intent Solutions VPS break-glass path at `~/000-projects/intentsolutions-vps-runbook/docs/break-glass.md` is the model for any future AGP infra (e.g., a hosted-plan or signing-server epic), but AGP is NOT currently hosting any such surface.
- **Antipattern fence**: NEVER `eval "$(sops -d ... | sed 's/^/export /')"`. Always anchored-regex variant.

### 9.3 Honest security assessment

**Implemented at v0**:

- Ed25519 hash-chained journal (signed but not nonrepudiable; operator signs their own log)
- SOPS+age encrypted secrets at rest
- Docker namespace isolation for the sandbox
- Slack-interactivity webhook signature validation
- File exfiltration guard (`assertSendable()`) preventing state-dir leakage
- Inbound gate (`gate()`) dropping ungated messages, peer-bot allowlist
- Permission-reply-text filter at the gate (prevents prompt-injected approvals)
- `MARKETING_CLAIMS.md` as code with pre-commit enforcement
- Schema-slot reservation at first commit
- Single-host Unix-socket Gateway (no network exposure)
- `agp.intentsolutions.io` scoped subdomain (limits cookie/OAuth blast radius)

**Aspirational at v0** (deferred per AT-DECR):

- WebAuthn / passkey approval-binding → v0.4
- Per-tenant signing keys (KMS-backed) → v0.3
- Multi-tenant `gate()` rewrite → v0.3
- Sigstore-signed sprite releases + sprite identity registry → v0.6 (CISO non-negotiable)
- Firecracker / microVM sandbox isolation → v0.3+
- Sender-constrained tokens (DPoP / mTLS) on HTTP Gateway → before any RFC publication
- Public protocol RFCs → v0.7 after CSO 4-phase sequencing

**Will not have, ever** (intentional):

- Operator nonrepudiation against themselves (structurally unfixable without third-party witness service)
- Compliance certifications (SOC2 / ISO27001) — out of scope for OSS-first frame
- Closed-source proprietary modules — Apache 2.0 unanimous council decision
- Vendor lock-in to a specific sandbox provider — SandboxProvider interface ensures portability

---

## 10. Costs & Resource Footprint

### 10.1 Engineer time

| Phase | Notes | Engineer-hours estimate (Jeremy spare-cycle) |
|---|---|---|
| v0 (1 wk core + 1 wk onboarding equivalent of effort) | Locked at 2-week effort budget; calendar will be longer because epics ship as defensible primitives, not against a deadline | ~50 hrs |
| v0.1 (multi-harness sprite via Epic 12) | Gated on SpriteAdapter contract validation, not a calendar slot | ~50 hrs |
| v0.2 (optional internal-readiness milestone — NOT a hosted demo) | May be skipped; if used, internal-only | ~0–20 hrs |
| v0.3+ (Q3 2026 backlog) | Variable; gated on inbound demand | Variable |

> **Phase B controlling change**: an earlier version of this table included a "6-week-to-demo total: ~150 hrs" row tied to the Forrester April 2026 Landscape submission window. **That row is removed.** Hours are still estimates — the budget discipline is preserved — but the calendar is no longer paced by an external analyst-relations deadline.

### 10.2 Runtime cost (Phase B v0 — operator-only)

- VPS: NONE at Phase B v0. AGP runs on the operator's machine. The shared VPS continues to host CCSC + other production services as before, but AGP itself is not deployed there.
- Storage: Bun binary + per-session audit logs live on the operator's disk.
- Bandwidth: NONE — no network exposure beyond what the operator's existing Slack workspace already requires for CCSC.
- LLM auth: the operator's existing Claude Code login session (per CCSC posture). No API-key cost held by AGP.
- TLS cert: NONE — there is no public surface.

> **Phase B controlling change**: an earlier version of this section costed a "v0.2 hosted demo on Contabo VPS" including basicauth, Caddy TLS, demo-walkthrough API spend, etc. **That section is removed.** There is no hosted demo to cost.

### 10.3 External commitments

- Apache 2.0 license: no fee, perpetual; cost is loss of license-rent extraction (deliberate)
- Domain: `agp.intentsolutions.io` reservation is a subdomain of an already-owned domain; $0 marginal; not currently serving traffic
- GitHub repo: free (public repo); $0 marginal

### 10.4 Risk-weighted opportunity cost

Per CFO council seat: every day on AGP is 8 hours not on searchcarriers / hustle / DiagnosticPro. The full 16-epic Phase B plan is a multi-month opportunity-cost commitment. Without an external deadline forcing the pace, the discipline shifts to: **each epic must produce a defensible primitive whose acceptance criteria are met before the next epic starts.** ROI threshold for continued investment: at minimum, dogfooded value (Jeremy uses AGP for real work on his own repos) by the time Epic 06 closes, and one external validator (advisor, partner, or co-maintainer) engaged before Epic 12 closes. Without those signals, the v0.3+ backlog is paused.

---

## 11. Failure Modes & Recovery

### 11.1 Audit chain divergence

**Mode**: A bug in `journal.ts` (e.g., a non-canonical JSON serialization) causes new events to hash differently than the verifier expects.

**Blast radius**: All events from the bug-introduction commit are unverifiable. The chain is broken.

**Recovery**: Identify the bug-introduction SHA via `git bisect` on `agp verify ~/.agp/audit.log`. Fix the bug. Issue a SCHEMA_MIGRATION event signed by the operator at the bug-introduction point. Document the divergence in MARKETING_CLAIMS.md (no claims about the affected period).

**Prevention**: 986+ tests in CCSC's `journal.ts` test suite. Stryker mutation testing at 87.76% on `journal.ts`. Pre-commit JCS canonicalization check.

### 11.2 Confused-deputy via Gateway protocol

**Mode**: Sandbox-side prompt-injected agent crafts a Gateway message that the control plane signs against the operator's key, conferring nonrepudiation to attacker-authored entries.

**Blast radius**: The operator's audit log contains attacker-signed entries indistinguishable from genuine ones.

**Recovery at v0**: Unix-socket topology means the attack requires local code execution; the attack surface is limited to the sandbox itself, which the operator already accepts as untrusted. Operator quarantines the session, restores the chain to pre-attack state if possible, files an incident.

**Recovery at v0.3+**: DPoP / mTLS sender-constrained tokens prevent the attack at the transport layer. Without these, AGP must NOT expose Gateway over HTTP.

**Prevention**: Cannon-2's finding is documented in `THREAT-MODEL.md`. CTO binding constraint: Gateway-socket interface MUST fix this BEFORE any RFC publication.

### 11.3 Slack workspace bot revocation

**Mode**: Workspace owner uninstalls the AGP Slack app or rotates the bot token without telling the operator.

**Blast radius**: All Slack projection fails. Sessions hang at first approval-required tool call.

**Recovery**: `agp init` to re-install the app. Existing local logs remain authoritative. Resume sessions per `agp sessions resume`.

**Prevention**: Document in CONTRIBUTING.md for hosted-plan operators that workspace-owner authority matters.

### 11.4 Operator key compromise

**Mode**: SOPS key leaked / ssh-key compromised → attacker has signing key.

**Blast radius**: Attacker can sign forged audit entries that verify as genuine. Future entries are tainted; past entries are not (chain integrity preserved).

**Recovery**: `agp keys rotate` issues a KEY_ROTATION event; old key stays in the keyring for historical verification. All entries from the rotation point are signed by the new key.

**Prevention at v0**: Documented as a v0 limitation. Operator MUST follow SOPS hygiene (chmod 600 on age key, scoped GitHub Actions secrets, no key in chat).

**Prevention at v0.3+**: Per-tenant KMS makes the blast radius per-tenant rather than per-operator.

### 11.5 (REMOVED — Forrester evaluation deadline missed)

> **Phase B controlling change**: this failure mode was originally "v0.2 hosted demo slips past mid-March 2026; AGP not named in April 2026 Forrester Landscape." The hosted-demo goal is dropped and analyst-relations deadlines are not build drivers, so this failure mode no longer applies. **The original §11.5 is removed entirely** to avoid implying that "missing Forrester" is a tracked risk for AGP.

### 11.6 Bus factor (Jeremy)

**Mode**: Jeremy out of action (DOT audit, ELD outage, personal/health). AGP unmaintained.

**Blast radius at Phase B v0**: Limited — single self-hosted instance on Jeremy's own machine, signed log remains verifiable from any machine with the public key. No external customers depending on uptime. No hosted demo to go down. The OSS repo continues to exist; community contributors (if any) can keep PRs flowing against it.

**Blast radius later (post-Epic 11, once a public surface eventually exists)**: TBD by the future epic that opens that surface. Whatever that epic is, its acceptance criteria must include a bus-factor mitigation step before any external promise of uptime.

**Recovery**: Document break-glass operations (already exists for VPS in runbook). Bring on a second maintainer before any enterprise pitch per cannon-4's mitigation.

**Prevention**: CMO bus-factor critique stays open. Second-maintainer recruitment is now sequenced by milestone (not by calendar) — the trigger is "when an external user asks for a guaranteed-response-time SLA."

---

## 12. Recommendations & Roadmap

### 12.1 Immediate (Phase B Epic 00 — planning cleanup)

1. **(DONE)** Scaffold `~/000-projects/agent-governance-plane/` as the canonical AGP repo with governance dressing (this repo). Path-drift cleanup from the pre-monorepo path lands as part of Epic 00's C9 child.
2. **(DONE)** File the 16-epic Phase B plan as parent beads + GitHub issues with full mirror discipline.
3. **(IN FLIGHT — this section is the artifact of)** Close out Epic 00's 10 child contradiction-fix beads (C1–C10 + AAR) so the planning package is internally consistent before any implementation epic starts.
4. Pin the CCSC kernel reference to commit `08b5f2f` so AGP substrate work (Epic 02) can reference a stable upstream — captured in the Epic 02 ADR when that lands.

### 12.2 Short term (Phase B Epic 01 → Epic 05 — defensible primitives)

The 16-epic Phase B plan replaces the original "v0 → v0.1 → v0.2 demo" sketch. Short-term work is now sequenced through:

1. Epic 01 — repo + governance + tracking mirror (mostly done by pre-flight; remaining gaps tracked).
2. Epic 02 — CCSC substrate extraction ADR (vendor / submodule / path dependency / shared package).
3. Epic 03 — core contracts (Gateway, SpriteAdapter, SandboxProvider, ChannelAdapter, PolicyVerdict, JournalEvent) with schema-slot reservation as a CISO non-negotiable.
4. Epic 04 — CLI + daemon (`agp init` / `agp doctor` / `agp run` / `agp verify`).
5. Epic 05 — Unix-socket Gateway protocol (HTTP Gateway forbidden until sender-constrained auth).

### 12.3 Medium term (Phase B Epic 06 → Epic 11 — the security boundaries)

1. Epic 06 — Claude Code sprite (first harness, real not slide).
2. Epic 07 — Docker sandbox with honest isolation limits.
3. Epic 08 — Slack channel adapter + HITL approvals (local journal authoritative, Slack as projection).
4. Epic 09 — Policy engine integration (fail-closed, dangerous-ops default-deny).
5. Epic 10 — Signed audit journal + offline verifier (Ed25519 + hash chain, schema slots day-one).
6. Epic 11 — MARKETING_CLAIMS.md + docs linting CI gate.

### 12.4 Long term (Phase B Epic 12 → Epic 15 — multi-harness, identity, release discipline)

1. Epic 12 — second harness through SpriteAdapter contract; multi-harness claim unlocked only after contract tests pass.
2. Epic 13 — sprite identity + supply-chain verification; Sigstore evaluation for sprite release signing.
3. Epic 14 — multi-tenant readiness without enabling hosted multi-tenant too early; `tenant_id` reserved null at v0.
4. Epic 15 — release discipline: AAR template, evidence-bundle format, claim-scan + threat-model review on every release.

### 12.5 Honest recommendations to Jeremy

- **Each Phase B epic ships when its acceptance criteria are met, not on a calendar.** The Phase B controlling change rejects analyst-relations deadlines as build drivers. The discipline is: defensible primitive → close the epic with AAR + evidence → next epic.
- **Use the inbound credibility surface.** Mudit Gupta (Polygon), Nixtla CEO, Lit Protocol, Elm — the people who found AGP-adjacent thinking and reached out. Send any one of them the AGP repo link when Epic 05 (Gateway) is real, not before. The first external review is more useful against shipped primitives than against planning docs.
- **Dogfood is the gate.** AGP must work for Jeremy fixing a real CCSC or `claude-code-plugins` bug before anyone else is invited. If Epic 06 closes and Jeremy doesn't end up using AGP for real work, that is the signal to pause and rescope — not to push forward into Epics 07-15.
- **Reversing course remains cheap as long as it's done early.** Epic 00 (planning cleanup) is the cheapest off-ramp. Epic 02 (substrate extraction ADR) is the next-cheapest. After Epic 04 (CLI), the sunk-cost gradient gets steeper.

---

## 13. Quick Reference & Appendices

### 13.1 Glossary

- **AGP**: Agent Governance Plane. The project this audit covers.
- **CCSC**: `claude-code-slack-channel` — the production-shipped Slack ↔ Claude Code bridge whose kernel modules AGP lifts.
- **ISEDC**: Intent Solutions Executive Decision Council — the 7-seat adversarial council that ratified AGP strategic direction on 2026-05-27.
- **Cannon**: Pre-council adversarial review by 4 specialized agents (architect / security / product-critic / market-analyst) that pressure-tests a synthesis before the council reads it.
- **Sprite**: The AGP term for an agent-harness adapter. v0 has one sprite (Claude); v0.1 adds Codex; third parties write their own via SpriteAdapter interface.
- **Sandbox**: The isolated runtime where the sprite + agent execute. Docker at v0; Firecracker at v0.3+; pluggable via SandboxProvider at v1+.
- **Gateway protocol**: The protocol between sandbox and control plane. Unix-socket at v0; HTTP+Bearer at v0.3+.
- **Control plane**: The AGP daemon process. Holds creds, runs `gate()`, signs journal, posts to Slack.
- **Channel layer**: Where the operator sees what's happening. Slack-only at v0–v0.2; multi-channel possible at v0.5+.
- **MARKETING_CLAIMS.md**: The CISO-locked file listing which marketing claims are allowed at which version. Hash-pinned, pre-commit-enforced, version-gated allowlist.
- **THREAT-MODEL.md**: The file listing what v0 defends, what v0 explicitly does NOT defend, and what each later vN unlocks.
- **Forrester Landscape**: Forrester Research's market-category evaluation reports. Cited in §1 and §7.3 as a market-context reference only — analyst-relations deadlines are NOT build drivers per the Phase B controlling change. The "Agent Control Plane" Landscape was announced December 2025 with a first report due April 2026; that calendar is not pacing the AGP build.
- **6-week competitive window** *(historical framing, superseded)*: An earlier version of this glossary defined this as "AGP project start (early June 2026) to Forrester submission window (mid-March 2026)" — driving a 6-week-to-demo cadence. The Phase B controlling change rejects that framing entirely. There is no demo deadline.

### 13.2 FAQ

**Q: Why not just extend CCSC instead of starting AGP?**
A: CCSC is Slack-native, Claude-only, single-tenant, MCP-stdio. AGP is multi-harness, multi-tenant-capable (at v0.3+), and uses HTTP+Bearer Gateway transport. They are different products with overlapping kernel modules.

**Q: Why Apache 2.0 instead of BSL or AGPL?**
A: Q1 unanimous council decision. OpenSSF / in-toto / SLSA / SIG-GenAI audience reads OSS optics inversely to corporate optics. Apache 2.0 patent grant + community trust is the foundation. Revisit only after specific cloud-vendor strip-mining incident.

**Q: Why no public RFCs at v0?**
A: Q5 council decision (5-1-1, CMO lone dissent). Cannon-2's SESSION_TOKEN bearer-credential finding is dispositive — we cannot publish a Gateway protocol with a known unfixed attack. CSO 4-phase community-temperature sequencing through v0.7+.

**Q: Why is `journal.ts` the load-bearing file?**
A: The hash chain is the entire signed-audit story. Any bug in `journal.ts` breaks the v0 marketing claim. 986 tests, 87.76% mutation score, pre-commit JCS canonicalization check — and the single-writer assumption is the structural property that makes the chain provably linear.

**Q: What happens if Forrester doesn't name AGP?**
A: Not a tracked risk for AGP. The Phase B controlling change rejects analyst-relations deadlines as build drivers. AGP's category-authorship story is earned through shipped primitives (the 16-epic Phase B plan) and the OSS-repo surface. Forrester (or any other analyst) is welcome to read the repo whenever they like; the build does not pace itself to their reporting cycle.

**Q: What's the worst plausible outcome of shipping v0?**
A: A security researcher demonstrates the SESSION_TOKEN bearer-credential attack on day 1 of public-repo visibility. AGP updates THREAT-MODEL.md, files a security-advisory bead, and accepts the reputational hit. The MARKETING_CLAIMS.md discipline (Epic 11) limits the FTC exposure because the v0 claim is exactly "signed audit log of every tool call" — not "tamper-evident" or "nonrepudiable." There is no hosted demo to retract because the Phase B controlling change does not deploy one.

**Q: Why is Jeremy the only buyer at v0?**
A: Q3 council decision (6-1 strong majority). Single buyer = single liability surface. Cannon-4's "buyer confusion is fatal" verdict. Small dev teams are the natural adoption population at v0.1+; platform-eng deferred to v0.8; compliance shops deferred to v1+.

### 13.3 Document map

| Doc | Path | Role |
|---|---|---|
| Master blueprint | `000-docs/002-PP-PLAN-agp-master-blueprint-2026-05-27.md` | Third-party reviewer's single entry point |
| ISEDC decision record | `000-docs/001-AT-DECR-isedc-agp-strategic-direction-2026-05-27.md` | Binding strategic decisions + 2026-05-27 timing amendment |
| Operator audit (this doc) | `000-docs/003-AA-AUDT-agp-operator-audit-2026-05-27.md` | Hybrid CCSC-substrate + AGP-composition operational analysis |
| Cannon adversarial review | `000-docs/004-AR-CANN-agp-cannon-adversarial-review-2026-05-27.md` | Pre-council 4-agent adversarial input |
| CCSC substrate | `~/000-projects/claude-code-slack-channel/` | The shipped governance kernel AGP composes |

### 13.4 Substrate facts (verifiable from `~/000-projects/claude-code-slack-channel/`)

| Fact | Value | Source |
|---|---|---|
| Latest CCSC tag | v0.10.0 | `git tag --sort=-version:refname` |
| Latest commit on `main` | `08b5f2f` | `git log -1 --oneline` |
| `server.ts` LoC | 3,250 | `wc -l server.ts` |
| `lib.ts` LoC | 1,894 | `wc -l lib.ts` |
| `journal.ts` LoC | 1,450 | `wc -l journal.ts` |
| `supervisor.ts` LoC | 980 | `wc -l supervisor.ts` |
| `policy.ts` LoC | 818 | `wc -l policy.ts` |
| `manifest.ts` LoC | 573 | `wc -l manifest.ts` |
| Total production TS LoC | **11,872** (live, 2026-05-28) | `find . -maxdepth 2 -name '*.ts' ! -name '*.test.ts' ! -path './features/*' ! -path './node_modules/*' ! -path './scripts/*' \| xargs wc -l \| tail -1` |
| Test count | 986 | per CCSC CLAUDE.md (drifts; soft floor lives in coverage) |
| Coverage floor | 95% line + func | `scripts/coverage-floor.sh` |
| Mutation score (`journal.ts`) | 87.76% | `000-docs/MUTATION_REPORT.md` |
| Mutation score (`lib.ts`) | 84.78% | `000-docs/MUTATION_REPORT.md` |
| Mutation score (`manifest.ts`) | 92.06% | `000-docs/MUTATION_REPORT.md` |
| Mutation score (`policy.ts`) | 78.00% | `000-docs/MUTATION_REPORT.md` |
| Mutation score (overall) | 85.22% | `000-docs/MUTATION_REPORT.md` |

### 13.5 References to authoritative external sources

- Forrester category announcement: https://www.forrester.com/blogs/announcing-our-evaluation-of-the-agent-control-plane-market/
- Slack Block Kit for AI Agents: https://slack.dev/build-richer-agent-experiences-with-block-kit/
- Browser Use sandbox architecture: https://browser-use.com/posts/two-ways-to-sandbox-agents
- Larsen Cundric's spark post: https://x.com/larsencc/status/2027225210412470668
- Intent Solutions Testing SOP: `~/.claude/CLAUDE.md` § "Intent Solutions Testing SOP"
- ISEDC reusable pattern: `~/.claude/skills/exec-decision-council/SKILL.md`

---

*End of operator audit. Companion to `001-AT-DECR-...` (decisions), `002-PP-PLAN-...` (blueprint), `004-AR-CANN-...` (adversarial input).*
