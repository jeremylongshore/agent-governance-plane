# 054 — Intendants (governed background agents): composition-plane execution roadmap

**Status:** Active (roadmap landing, 2026-07-09; renamed + Slice-0 agent superseded
2026-07-10 per intent-os `030-AT-DECR` — the platform is **Intendants**, always
presented with the tagline "governed background agents"; the prior working name is
retired on all surfaces by all-seat ISEDC veto). Execution-ordering doc for the
11-epic Intendants vision. It changes **no** locked decision in `001-AT-DECR`
and composes with the Phase B plan (`002-PP-PLAN`) and the post-v0 roadmap
(`039-PP-ROAD`) rather than superseding them. The Build-vs-Compose decision that
authorizes the first net-new artifact is `055-AT-ADR`.

## Context

The destination is a proactive/background-agent platform — an AI operating system,
not an app: natural-language intent → a governed agent that runs on triggers, keeps
state so it isn't noisy, exercises judgment, and reports/acts. Two facts shape how it
gets built:

1. **The hard subsystems already exist in the estate under other names** — AGP
   (governance/runtime/audit), the Governed Second Brain / GSB (memory/state; since
   2026-07-10 productized as **Bob's Big Brain**: umbrella
   `intent-solutions-io/bobs-big-brain-umbrella`, engines
   `jeremylongshore/bobs-big-brain-compiler` + `jeremylongshore/bobs-big-brain-registrar`,
   plugin `jeremylongshore/bobs-big-brain-plugin`),
   IEP·JRig (evaluation), CCSC (Slack). So this is a **composition** effort, not a
   from-scratch rebuild.
2. **Jeremy's sequencing principle is the organizing constraint:** *"each epic should
   leave you with a usable platform, not a pile of unfinished infrastructure."*

## The re-cut: horizontal epics → vertical slices

The 11 epics numbered as-is are **horizontal layers** (all-of-compiler → all-of-runtime
→ all-of-scheduler → …). Built that way you hold 10 half-finished subsystems and no
running agent until the end — the exact "pile of unfinished infrastructure" the
principle rejects. **Re-cut into vertical slices** — one agent driven through the whole
stack, then widen — and the same 11 epics' beads leave a usable platform at every step.
This is a build-order change, **not** scope reduction: every epic and nearly every bead
survives.

## The reframe: the product is the composition plane, not the agents

The estate + GitHub-org sweep found that the hardest agents already run, and they all
share one gap: **no common trigger and no shared governance/eval/delivery spine.**
perception's scheduler is unwired; intentvision's cron was disabled to save Actions
minutes; intent-mail's watch-daemon isn't bound to a runnable command. That shared gap
*is* the platform. We are not building 11 epics of new infrastructure — we are building
the **thin composition plane** (a trigger layer + AGP governance + JRig eval +
CCSC/Discord delivery) those existing agents plug into.

## The 11 epics → what is already owned (compose, don't rebuild)

| Epic | Core need | Owned asset | Posture |
|---|---|---|---|
| 1 — Intent Language & Compiler | NL → agent spec | `@intentsolutions/core` (SAK) validates `agent-definition` | Compose; compiler emits a **draft**, a human commits it |
| 2 — Agent Runtime | Execute one agent safely | AGP `mediate()` + Docker sandbox + secret post-gate | Compose; supervisor/retry/limits are the net-new hardening |
| 3 — Scheduler & Event Engine | Wake agents | **net-new (small):** `trigger-source` → `mediate()`; cron + webhooks | Build; liveness dead-man's-switch is first-class |
| 4 — State & Memory | Remember only what matters | Bob's Big Brain (`bobs-big-brain-compiler` + `bobs-big-brain-registrar` + qmd; plugin `bobs-big-brain-plugin`) — tamper-evident receipts | Compose; do not build a new state store |
| 5 — Tool & Integration Platform | Reach the world | MCP as the plugin SDK; CCSC/GitHub adapters | Compose |
| 6 — Policy & Governance | Safe execution | AGP capability model, HITL, `{{secret:NAME}}` | Compose |
| 7 — Evaluation & Learning | Measurable quality | IEP·JRig binary criteria + judge + Rollout-Safety | Compose — and **move to the front** (Slice 0) |
| 8 — Observability & Audit | Explain every action | AGP signed journal + GSB receipt chain | Compose; **cross-chain pointer** is a bead here |
| 9 — Developer Experience | Adoption | AGP CLI + intendants; dashboards net-new | Compose CLI; build UI later |
| 10 — Agent Marketplace | Ecosystem | claude-code-plugins catalog + validators | Build the **artifact** in Slice 0; defer the market |
| 11 — Intent Graph | Agents as a network | CCSC channels (working A2A) + walkie-talkie (protocol) | Later slice; share-nothing by design |

## Three invariants — design in from the first slice

Cheap now, unrecoverable later. Each is a first-class Slice-0 bead (`agp-eva.1.*`):

- **Cross-chain governance pointer (Epic 8, `agp-eva.1.2`).** Every AGP action entry
  can embed the global Bob's Big Brain governance tip observed at decision time plus
  a shared `correlation_id`. This makes action-to-governance-position correlation
  verifiable after the fact. It does not identify the exact `qmd://` results an agent
  read; that requires a separate read-set receipt. The `trigger-source` contract
  carries `correlationId` from its first commit so evidence can be joined by run.
- **Liveness supervisor (Epic 3, `agp-eva.1.3`).** Unattended agents fail *silently*
  (alive-but-stuck / dead-and-unnoticed) — the failure class with no recovery path.
  Heartbeat + restart-intensity bounds + escalate-on-silence, first-class. Jeremy
  already runs this reflex as `automation-liveness-sweep.sh`. `TriggerSourceSpec`
  carries `livenessTimeoutMs` and the port exposes `heartbeat()` for it.
- **Human commit gate on inferred specs (Epic 1, `agp-eva.1.4`).** The model proposes
  a spec; a human deterministically commits it before it reaches the policy gate.
  AGP's own "model proposes, deterministic system decides" constraint — never let a
  model infer the permissions the governance kernel exists to check.

## The deploy rule

**`Prompt → Spec → Tests → Policy → Deploy`**, CI-enforced, with every agent template
shipping its own `tests/{unit,contract,policy,regression,evals,acceptance}/` pack. This
is buildable only because three test layers with no home in the standard 7-layer
taxonomy — **policy**, **evaluation/judgment**, **state/memory** — map 1:1 onto assets
already owned (**AGP / IEP / GSB**). That is the differentiator.

## Build order — vertical slices, each a usable platform

- **Slice 0 — deploy rail + test/eval harness + one real agent, end to end.** A thin
  vertical through Epics 1,2,3,4,6,7,8. First agent = **the owned-parts GitHub watcher**
  (SUPERSEDES intentvision, which lost its staging path in the 2026-07-09 GCP teardown —
  recorded supersession: intent-os `030-AT-DECR`): notify-lib cron spine + the
  trigger-source contract + `gh` polling, whose consequential action is a
  **require-verdict `gh issue create`, HITL-approved in Slack, against a repo we own** —
  exercising the contract's required, fail-closed `correlationId` end to end, with zero
  paid third-party dependencies on the proof path. intentvision is deferred, not killed:
  its detector core (`packages/pipeline` — ensemble anomaly + Nixtla TimeGPT, libsql,
  zero GCP refs) returns in a later slice as a governed tool. x-bug-triage is the
  committed Slice-1 product story (X-token verified first). **Home:** spike the trigger
  inside AGP flag-gated (kernel stays clean), then extract the composition to
  `jeremylongshore/intendants` — extraction is an EVENT gated on the five conditions in
  `030-AT-DECR`, never a date. Epic bead `agp-eva.1`.
- **Slice 1 — widen triggers & tools (Epics 3 full, 5).** More event sources, more MCP
  adapters. Usable platform: agents watching many systems.
- **Slice 2 — evaluation productized + the IEP epic (Epics 7 full, 8, 10-core).**
  Generalize JRig's EvalTarget `skill`→`agent`; enforce the eval-pack deploy gate; ship
  `cosign`-verifiable Evidence Bench bundles per agent. Usable platform: verifiable
  agent quality.
- **Slice 3 — authoring & DX (Epics 1 full, 9).** Full intent compiler (draft-emitter +
  human commit gate), dashboard, editors, run-now, state viewer.
- **Slice 4 — marketplace (Epic 10 full).** Publishing/discovery/ratings/versioning;
  every template already ships its Slice-0 test pack.
- **Slice 5 — Intent Graph (Epic 11).** Agent discovery, message-passing, dependency
  graph — share-nothing, stale-read-treated-as-crash.

## Verification

- **Slice 0:** the first agent runs across consecutive triggers, surfaces only
  genuinely-new/meaningful events with **zero duplicate alerts** (state/dedup); its
  test pack passes all layers including the 3 custom ones; AGP `verify` + GSB audit both
  green **and** the cross-chain pointer resolves every stamped governance tip; full
  audit-harness gate chain green in CI.
- **Every slice** ends on a running, usable platform increment — never a half-built
  horizontal layer.
- **Standing gate:** would Jeremy keep the running agents on? A "no" at any slice
  boundary is a signal to hold and reassess before widening.

## Slice-0 status (this doc's companion work)

The net-new AGP entry point — the **`trigger-source` contract** (`src/contracts/`,
frozen leaf, flag-gated) — landed with `055-AT-ADR` (authorization) and `056-AT-CONT`
(the contract doc). The **Slice-0 build landed 2026-07-10** (`agp-eva.1.5`): the
governed GitHub watcher (`src/triggers/github-watcher/` + `agp watch run|status|enable`),
driven by `daemon.runMediated()` (proxy-execution with per-call feedback), with all
three invariants wired — cross-chain governance pointer (`trigger.fired`/`trigger.settled`
journal brackets carrying `correlationId` + the governance-receipt chain's tip,
`agp-eva.1.2` substrate), liveness dead-man's-switch + restart-intensity bound
(`agp-eva.1.3`), and the human commit gate on specs (`agp-eva.1.4` validator core) —
plus the **agent-template + test-pack artifact** (`templates/github-watcher/` with
unit/policy/state/acceptance packs; RTM REQ-042…047). Remaining under `agp-eva.1`:
the GSB backend swap behind the state-log shape (full `.1.2`), the LLM-propose→
human-commit authoring flow (full `.1.4`), and the live operator dogfood run
(Docker sandbox + Slack HITL + a real repo).
