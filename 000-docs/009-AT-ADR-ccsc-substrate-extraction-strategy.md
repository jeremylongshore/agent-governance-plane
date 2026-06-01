---
title: ADR — CCSC Substrate-Extraction Strategy
date: 2026-05-31
author: Jeremy Longshore
type: Architecture Decision Record (ADR)
status: Proposed — awaiting operator decision
epic: Epic 02 — Extract the CCSC governance kernel into an AGP-compatible substrate boundary (bead agp-7ii)
supersedes_assumption: C8 (Epic 00) deferred the direct-import assumption to this ADR
decision: PENDING (operator sign-off required; see "Decision" section)
---

# ADR — CCSC Substrate-Extraction Strategy

> **Status: Proposed.** This ADR lays out the options and a recommendation. It
> does **not** enact a choice. The operator (Jeremy) records the decision in the
> "Decision" section; only then do the boundary scaffold and substrate-compat
> tests (the rest of Epic 02) proceed.

## Context

AGP composes the CCSC governance kernel (`claude-code-slack-channel`) rather than
building one from scratch. Epic 00's C8 finding removed the wrong "direct import /
monorepo refs" assumption from the planning docs and deferred the actual
consumption mechanism to this ADR. We need a deliberate, reproducible way for AGP
to consume CCSC code — not copy-paste chaos, and not an assumption that doesn't
match the real repo.

### What CCSC actually is today (grounded, not assumed)

Measured against `claude-code-slack-channel` at `v0.10.0` (commit `023cab3`):

| Fact | Reality | Why it matters |
|------|---------|----------------|
| License | **Apache-2.0** (relicensed from MIT in PR #194, `f6d164d`, on `main`) | The epic's premise of an "MIT ↔ Apache boundary" is **stale**. It is now Apache-2.0 ↔ Apache-2.0 — a NOTICE/attribution file is the only license obligation. This removes a whole class of friction. |
| Package shape | App, not library: `package.json` has `bin: ./server.ts`, **no `main`, no `exports`, no `files`** | CCSC exposes no public API surface. Nothing is designed to be imported by another package today. |
| Layout | ~11,872 LoC of kernel modules **at repo root** (no `src/`, no package subdir) | There is no kernel boundary to point at; the "kernel" is a subset of root-level files. |
| Coupling | Dense `./`-relative cross-imports — `server.ts` pulls `./policy.ts`, `./journal.ts`, `./lib.ts`, `./crypto.ts`, `./nonce-hitl.ts`, `./manifest.ts`, `./supervisor.ts`, … | Any consumption that imports CCSC files transitively drags in the web. A clean kernel carve is real refactor work, not a re-export. |
| Module sizes | `server.ts` 3250, `lib.ts` 1894, `journal.ts` 1450, `supervisor.ts` 980, `policy.ts` 818, `crypto.ts` 294, `nonce-hitl.ts` 337 LoC | The primitives AGP wants (gate/policy, hash-chained journal, Slack relay) are individually tractable, but `server.ts` mixes app wiring with kernel logic. |

### What AGP needs from the substrate (at v0)

- The `gate()` policy primitive (`policy.ts` / `policy-dispatch.ts`).
- The hash-chained journal (`journal.ts` + `crypto.ts` + `audit-key-loader.ts`).
- The Slack thread/Block-Kit relay + nonce-HITL approval (`stream-reply.ts`, `nonce-hitl.ts`, parts of `lib.ts` / `server.ts`).
- A reproducible build from a fresh clone (external contributors + CI must work without a side-checkout).
- A recorded upstream pin so AGP's substrate is traceable to an exact CCSC commit.

### Constraints

- AGP is **pre-code** (the CLI scaffold is Epic 04; nothing imports CCSC yet) — so we are choosing the boundary *before* there is integration debt. Cheapest possible time to decide.
- AGP and CCSC are **separate repositories**, not a shared monorepo workspace.
- v0 target is a single operator with defensible primitives — **not** a multi-consumer distribution.

## Options

### Option A — Vendor a pinned kernel subset (copy into AGP)

Copy the specific kernel modules AGP composes into an AGP-owned directory (e.g.
`substrate/ccsc/`), recording the exact upstream commit pin and a documented
re-sync procedure.

- **Pros:** reproducible from a bare clone; zero submodule/path-dep fragility for contributors and CI; full control over what is pulled in; Apache↔Apache needs only a `NOTICE`; works offline; lets AGP carve only the kernel subset instead of the whole app.
- **Cons:** divergence risk from upstream; re-sync is manual (cherry-pick / re-copy at a new pin); duplicated code lives in two repos; AGP must track upstream security fixes deliberately.

### Option B — Git submodule (pin CCSC at a commit)

Add CCSC as a git submodule pinned to a commit; AGP imports into the submodule
tree.

- **Pros:** exact commit pin; upstream history preserved; no copied code.
- **Cons:** submodule UX is a recurring footgun (contributors forget `--recursive`, CI needs explicit submodule steps); AGP would import **into an app's root-level files** over the `./`-coupled web — it inherits the whole tangle, not a kernel; bumping the pin is all-or-nothing.

### Option C — Path dependency (local sibling checkout)

Declare CCSC as a local path dependency in `package.json`, monorepo-style.

- **Pros:** live edits across both repos; trivial when both are checked out side by side.
- **Cons:** AGP and CCSC are **not** a co-located monorepo — this is **not reproducible from a clone**; breaks external contributors and CI that don't have the sibling checkout; couples AGP's build to a path outside its own tree. Effectively the rejected "monorepo refs" assumption in disguise.

### Option D — Shared kernel package (extract + publish)

Refactor CCSC to carve its kernel out of the app (`src/` layout, real `exports`),
publish it (e.g. `@intentsolutions/ccsc-kernel`), and have both AGP and CCSC
consume the versioned package.

- **Pros:** the clean, correct long-term boundary; semver-versioned; reproducible; supports multiple consumers; forces CCSC to define a real public API.
- **Cons:** large upfront cost **on CCSC** (kernel carve from a 3250-LoC `server.ts`, add `exports`, untangle `./` coupling, publish pipeline) for which AGP is the *only* consumer today; premature given AGP is pre-code and single-operator at v0; couples AGP's progress to a CCSC refactor.

## Recommendation (for the operator's decision)

**Recommended: Option A (vendor a pinned kernel subset) for v0, with Option D
(shared kernel package) as the documented end-state — trigger-gated on a second
consumer.**

Rationale:

1. **License friction is gone.** Both repos are Apache-2.0, so vendoring needs only a `NOTICE` crediting CCSC — no relicensing dance.
2. **CCSC has no boundary to point at today.** Options B and D both assume a kernel surface that does not exist; B drags in the whole app, D requires building the surface first. A lets AGP carve exactly the kernel subset it needs now.
3. **Reproducibility is a hard v0 requirement.** Option C fails it outright (no sibling checkout on a fresh clone / CI); A and D pass; B passes only with submodule ceremony contributors routinely get wrong.
4. **Decide cheap, defer expensive.** AGP is pre-code — vendoring a pinned subset is the cheapest reversible move. The shared-package refactor (D) is the right *end-state*, but doing it now spends CCSC refactor budget for a single consumer. Gate D on a real second consumer (a second harness, or CCSC itself wanting the kernel reusable).

Concretely, if accepted, Option A means: `substrate/ccsc/` in AGP holding the
carved kernel modules; a `substrate/UPSTREAM.md` recording the CCSC commit pin
(`023cab3` / `v0.10.0`) and the re-sync procedure; a top-level `NOTICE` for
Apache attribution; and a forward note that D is revisited at the second-consumer
trigger.

Rejected for v0: **B** (submodule fragility + imports-an-app-not-a-kernel),
**C** (not reproducible; the rejected monorepo-refs assumption in disguise).

## Decision

**PENDING — operator sign-off required.**

Record one of: `A (vendor subset)` · `A→D path as recommended` · `B (submodule)`
· `C (path dep)` · `D (shared package now)` · `other`. On decision, this ADR flips
to `Accepted`, the choice is annotated here with date + rationale, and the
remaining Epic 02 children proceed:

- Scaffold the chosen boundary (`substrate/` layout or package consumption).
- Write the CCSC→AGP substrate-compatibility tests.
- Link this ADR in all Epic 02 child beads + GH issues.

## Consequences

- **If A is accepted:** AGP carries a vendored kernel + an explicit upstream pin and sync ritual; security fixes in CCSC require a deliberate re-sync; the boundary is reversible into D later with low cost (the vendored modules become the package's contents).
- **License:** a `NOTICE` attributing CCSC (Apache-2.0) is required regardless of A/B/D; only C avoids a copy but at the cost of reproducibility.
- **Epic-description correction:** Epic 02 (`agp-7ii`) still describes an "MIT ↔ Apache" boundary and a CCSC relicense as in-flight; both are now resolved (CCSC is Apache-2.0 on `main`). The epic bead should be updated so future readers don't act on the stale premise.

## References

- CCSC repo: `~/000-projects/claude-code-slack-channel/` (`v0.10.0`, `023cab3`); relicense PR #194 (`f6d164d`).
- CCSC architecture + invariants: that repo's `CLAUDE.md`, `000-docs/audit-journal-architecture.md`, `000-docs/policy-evaluation-flow.md`.
- Origin of the deferral: Epic 00 C8 (bead `agp-5l8.9`) and AAR `008-RA-AAR-agp-planning-cleanup-2026-05-27.md`.
