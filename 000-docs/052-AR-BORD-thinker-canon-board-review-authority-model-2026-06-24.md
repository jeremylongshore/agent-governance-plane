# 052 — Thinker-Canon Board Review: AGP Authority Model

**Status:** Advisory verdict (recorded 2026-06-24). This is a multi-perspective
**advisory** review, **not** a binding ISEDC council ruling. It is the design
input to the eventual authority-model decision tracked by bead `agp-dxp` /
issue [#115](https://github.com/jeremylongshore/agent-governance-plane/issues/115).
A formal council ratification (`/exec-decision-council`) remains a separate step
if/when the position is locked.

## Context

Kenton Varda's (Cloudflare) capability-security critique of Anthropic's "Agent
Identity and Access Model" exposed a fork AGP had not explicitly chosen on: **does
an agent's authority derive from a human principal, or does the agent hold its own
service-account identity?** Fourteen canon reviewers (the "thinker board") were
convened to weigh in on the four decision points in #115. The full prompt and the
fork framing live in #115.

## The ruling (where the board converged)

| Decision point | Verdict | Strength |
|----------------|---------|----------|
| **1. Authority derivation** | **Human-derived** — the commanding human is the principal; reject agent-as-service-principal. AGP's HITL approver already embodies this. | 14 / 14 |
| **2. Per-human credential scoping** | **Defer the build; fix the position: per-*principal*, never per-*task*.** | unanimous defer |
| **3. No-cross-user-command** | **Write the invariant now (`speaker == owner`, bound to the *command* not the *session*); enforce at the multi-tenant gate.** | unanimous |
| **4. Journal attribution** | **Reserve `on_behalf_of` NOW — additive, nullable.** | 13 / 14 (Thompson dissents) |

## The reframing discovery

Decision point 4 was framed as "touches a frozen contract → heavy ADR ceremony."
That is **already false**: `JournalEvent` reserves four nullable future fields
from the first commit, with a CISO-locked council note stating that populating
them later is *not* a breaking change. Eight reviewers independently flagged this.
The board's converged move is therefore to **add `on_behalf_of` as the fifth
reserved field** — the exact additive pattern the contract was designed for.
Lamport noted `approval_binding_type` is *already* reserved — the slot for binding
an approval to the action it licenses exists; only the logic is unbuilt.

**Why this is the one thing to do now:** the signed, hash-chained journal is the
only **irreversible** artifact — "which human" cannot be retrofitted into events
already written and signed. Everything else (capability-vs-policy-gate, scoping)
is reversible behind `gate()` and can wait. (Pike's correction: bind the principal
to the **command**, not the **session** — the data-shape error that otherwise
contorts every downstream consumer.)

## The live latent bug the board located

Not in AGP — in the **CCSC substrate**: `supervisor.ts:328-329` sets `ownerId`
once at session creation and "stored owner wins," with **no `speaker == owner`
recheck**. Dormant today (single operator), but the day multi-user is enabled,
every signed journal entry is attributed to the session-opener regardless of who
issued the command — unforgeable, and unforgeably wrong. **Must be a hard
precondition on the multi-tenant gate.**

## Preserved dissents (minority positions, kept on the record)

- **Hickey — the real defect is *ambient authority*, not "which principal."** The
  broad sandbox + injected credentials force identity-interception on top to claw
  authority back (the policy-gate Kenton attacks). Authority should be a *value
  derived from the task and passed*, not an identity assumed. **Guardrail he
  insists on (and which this change encodes): `on_behalf_of` is accountability
  data and must NEVER be read to authorize.**
- **Thompson — capabilities = Unix fd-passing; they make the gate mostly dead
  code.** Don't add a journal field; derive provenance from which capabilities
  were exercised. Warns the policy engine becoming a second parallel permission
  system is the next CVE. (The board majority still reserves the field — cheap,
  additive, and accountability ≠ provenance.)
- **Karpathy + Huyen — the operational counterweight to capability purism.**
  "Infer capabilities from the task" is a *classifier* (precision/recall, no
  guarantees): over-grant = silent leak, under-grant = approval fatigue →
  rubber-stamping. Inference *proposes* scope; the gate *disposes*; the human is
  the backstop — and no LLM ever touches the deterministic `speaker == owner`
  check. Huyen: per-task capabilities = a secrets-rotation pipeline + approval
  fatigue squared; instrument HITL approval load before choosing.
- **Torvalds — don't pre-pay for tenants that don't exist.** Three of four points
  are cathedral-building; the only real defect is the CCSC recheck hole. Add the
  one-line field, write the assertion-as-gate-precondition, ship.

## Decided now vs deferred

**Acted on in this change (bead `agp-dxp.1`):**

- Record the *position* (human-derived authority) — this doc.
- Reserve `on_behalf_of` in `JournalEvent` (nullable, null at v0), with the
  accountability-not-authorization guardrail in the field doc + `013-AT-CONT`.

**Deferred to the multi-tenant build (parent `agp-dxp`, gated):**

- The `speaker == owner` (per-command) enforcement + the CCSC `supervisor.ts`
  recheck precondition.
- Per-principal credential scoping.
- The capability-vs-policy-gate mechanism choice — gated behind a capability-
  inference **eval** (Karpathy) and HITL approval-economics **telemetry** (Huyen)
  before any capability-inference reaches the authority path.

## References

- Issue [#115](https://github.com/jeremylongshore/agent-governance-plane/issues/115)
  (the fork, the four decision points, the CCSC substrate audit + jump-list).
- `000-docs/047-AT-ADR-multi-tenant-gate`, `046-AT-ARCH-multi-tenant-readiness`,
  `013-AT-CONT-journal-event` (the reserved-field contract).
- Beads: `agp-dxp` (the decision), `agp-dxp.1` (this change).
- Anthropic, "Agent Identity and Access Model"; Kenton Varda critique (2026-06-24).
