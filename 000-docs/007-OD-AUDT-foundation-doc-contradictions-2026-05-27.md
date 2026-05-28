---
title: AGP Foundation Doc Contradiction Audit (Line-Level Map)
date: 2026-05-27
auditor: general-purpose subagent (Claude Code, automated)
scope: Line-level inventory of every C1–C10 contradiction site in foundation docs 001-AT-DECR, 002-PP-PLAN, 003-AA-AUDT
verdict: ~75 contradiction sites mapped; fix-order recommendation provided
---

# AGP Foundation Doc Contradiction Audit (Line-Level Map)

## Executive Summary

Across the three in-scope foundation docs (`001-AT-DECR` 337 LoC, `002-PP-PLAN` 523 LoC, `003-AA-AUDT` 811 LoC), this audit found **~75 contradiction sites** across the 8 in-scope items (C1, C2, C3, C4, C7, C8, C9, C10).

Of those:

- **~15 require multi-line surgery** — paragraphs where C1 + C2 + C3 are co-located and rewriting one without the others would leave the prose incoherent (especially `002` §5.3 and `003` §11.5 + §2.1).
- **~60 are find-and-replace-grade** — single-line table rows, path strings, and version-tag drift.

The single largest contradiction cluster is **C1+C2 together** (Forrester April 2026 deadline + hosted demo as v0.2 goal) which are rhetorically fused throughout `002` and `003` and need a joint rewrite of the "amendment" framing.

The next-largest is **C9 path drift** (13 sites, three different path variants — `products-workspace/`, `products/`, `products/agp/` — none of which are the canonical `agent-governance-plane/`).

**C10 council authority** is the most subtle: `001` is structurally built around Claude-as-acting-head-of-board, which is not wrong as a historical record but **must be reframed** as "Jeremy delegated the synthesis exercise" rather than "Claude ratified strategic decisions."

## Out of scope for this audit

- **C5** (CCSC `server.ts` LoC drift) — a CCSC-side fix, not blocking AGP. Mentioned in passing where it co-locates with C4.
- **C6** (CCSC docs using "tamper-evident" etc.) — handled by Epic 11 (`agp-6mq`) AGP claim-control, not Epic 00. Inventoried below for the Epic 11 fix team's reference but not scheduled in this audit.

## Per-contradiction findings

### C1 — Forrester April 2026 / mid-March 2026 deadline as build driver

**Severity: HIGH** (load-bearing — drives the entire 6-week amendment framing)

| File | Line | Verbatim (~30 chars) |
|---|---|---|
| 001 | 277 | `formal Forrester Landscape report lands April 2026` |
| 001 | 297 | `aligned with the Forrester April 2026 reporting window` |
| 001 | 305 | `week 6 (pulled forward)` *(implicit Forrester dependency)* |
| 002 | 27 | `6-week competitive window opened in late May 2026` |
| 002 | 37 | `Forrester April 2026 reporting window` |
| 002 | 158 | `Forrester April 2026 window pulls v0.1 / v0.2 forward` |
| 002 | 165 | `named in the April 2026 Forrester Landscape` |
| 002 | 255 | `Amendment trigger: Forrester April 2026` |
| 002 | 275 | `Forrester April 2026 Landscape report submission window` |
| 002 | 287 | `forrester-landscape-evaluation@forrester.com` |
| 002 | 395 | `published April 15, 2026. Submissions...by mid-March` |
| 003 | 19 | `formal Landscape report dropping April 2026` |
| 003 | 31 | `v0.2 stands up a hosted demo...for Forrester-grade evaluation` |
| 003 | 593 | `v0.2 (hosted demo + Forrester brief)` |
| 003 | 663 | `### 11.5 Forrester evaluation deadline missed` |
| 003 | 665 | `slips past mid-March 2026` |
| 003 | 700 | `Submit Forrester analyst-relations brief by mid-March 2026` |
| 003 | 743–744 | `submissions for inclusion are due ~mid-March` / `mid-March 2026 effectively means 6 weeks from now` |
| 003 | 760 | `Q: What happens if Forrester doesn't name AGP in April 2026?` |

**Fix direction**: Strip the Forrester April 2026 / mid-March 2026 deadline as a justification entirely. The amendment section in `001` (§ post-deliberation) and §5.3 of `002` need full rewrites; the dependency graph in `002` (line 327, `agp-205 Forrester brief`) needs the brief bead removed or reframed as evergreen.

**Cross-contradiction interaction**: Heavily fused with **C2**. Most paragraphs that mention "April 2026 Forrester" also mention "hosted demo" in the same sentence; both must be addressed jointly.

### C2 — Hosted demo framed as v0.2 goal

**Severity: HIGH** (load-bearing — drives v0.2 epic identity)

Inventory: 001 L305 (v0.2 row); 002 L37, 165, 204, 255, 271 (§5.3 heading), 275, 277, 395, 414, 418, 495; 003 L19, 31, 400 (§7.2 heading), 442, 449, 497, 534, 540, 547, 593, 597, 600, 602, 613, 665, 679, 699, 764.

**Fix direction**: Replace v0.2-as-hosted-demo with v0.2-as-the-next-internal-milestone (whatever the new charter defines). The entire §5.3 of `002` (~30 lines) is a single rewrite block; §7.2 of `003` (deployment) and §10.2 of `003` (cost) need to be either deleted or re-scoped to a non-public deployment.

**Cross-contradiction interaction**: Co-located with **C1** (Forrester) and **C3** (version ladder — v0.2 semantics shift here).

### C3 — AGP version ladder drift (v0.2 semantics)

**Severity: MEDIUM** (drift is concentrated in the v0.2 row but ripples to v0.8)

Inventory: 001 L304–306 (v0.1/v0.2 amendment table rows); 002 L251 (§5.2 heading), L271 (§5.3 heading), L291–301 (full v0.3→v0.9 ladder), L300 (v0.8 row hosted-plan/v0.2-demo coupling); 003 L31 (v0 prose ladder).

**Fix direction**: Pick one definition of v0.2 and propagate. Recommend: v0.2 = next-after-multi-harness internal milestone (no hosted demo); the "hosted plan" stays at v0.8. The v0.2 row in `001`'s amendment table is the single source-of-truth line; fix there, then update `002` §5.3 + `003` §2.1.

**Cross-contradiction interaction**: C2 owns the demo language; C3 owns the version-label semantic.

### C4 — CCSC LoC drift (~13,000 / ~12,000 vs live 11,872)

**Severity: LOW** (single passing mentions, doesn't drive any decision)

Inventory: 002 L354 (`~5–6k of CCSC's ~12k LoC`); 003 L13 (`~12k LoC of production code`), L15 (`lift ~5–6k of CCSC's 12k LoC`), L791 (`Total production TS LoC | ~13,000`).

**Fix direction**: Replace `~12k` / `~13,000` with the live `wc -l` figure (`11,872`) — single global find-and-replace, four sites.

### C7 — AGP auth language implies Anthropic API key (live CCSC requires `claude.ai` login)

**Severity: MEDIUM** (multiple sites; misleads the operator-audit reader about live auth model)

Inventory: 002 L91 (`Holds creds (LLM API key, GH token, signing key)`); 003 L84 (`Holds creds (LLM API key, GH token)`), L361 (`Anthropic API key | n/a | https://console.anthropic.com`), L367 (`Anthropic API key sourcing`), L502 (`### 8.7 Anthropic API rate limit`), L505, L546, L602.

**Fix direction**: Reframe to call out that v0 inherits CCSC's auth requirement (Claude Code v2.1.80+ with `claude.ai` login, NOT API key). The "Anthropic API key" boxes in the architecture diagrams (`002`:91, `003`:84) and the `agp init` walkthrough (`003`:367) are the load-bearing ones.

### C8 — Docs assume "direct import of CCSC modules" / `src/kernel` package

**Severity: HIGH** (architectural — appears in every file, drives the `agp-002` bead and the entire §3 lift table)

Inventory: 001 L246 (`wire to CCSC primitives via direct import (monorepo refs, extract to lib later)`); 002 L237 (`agp-002 | Wire the agp CLI binary (Bun/TS) to CCSC primitives via direct import`), L336–354 (entire §3.4 lift table), L414, L473; 003 L157 (`kernel modules first`), L247 (`CCSC kernel modules lift to AGP namespace without forking`), L264–272 (`crypto.ts (lifted as-is)` × 8 entries), L340–342 (`src/kernel/journal.ts`, `src/kernel/gate.ts`, `src/kernel/crypto.ts` — these paths DO NOT exist in CCSC; modules are at repo root), L733, L749.

**Fix direction**: Reframe every "lift-and-shift" / "direct import" claim as "extraction strategy TBD; Epic 02 ADR will decide between monorepo refs, npm subpackage, or git-subtree of CCSC source." The `src/kernel/*` paths in `003`:340–342 are fabricated — those subdirs don't exist in CCSC; fix to "the CCSC modules whose responsibility maps to a future `src/kernel/*` layout."

**Cross-contradiction interaction**: Couples with **C9** — if path drift is being fixed (canonical `agent-governance-plane/`), C8's "monorepo refs" framing may itself be obsolete; resolve C9 first, then revise C8 in the new path universe.

### C9 — Canonical AGP path drift

**Severity: HIGH** (13 sites; three different wrong variants)

Inventory: 001 L245 (`~/000-projects/products-workspace/agp/`); 002 L11 (`target_repo: ~/000-projects/products/agp/`), L236 (bead row scaffold path), L472, L503–505 (three references to `~/000-projects/products/000-docs/006/008/009`); 003 L17 (`~/000-projects/products/agp/ is not scaffolded`), L247 (`sibling project under products-workspace/`), L293, L692, L773–776 (four references to `~/000-projects/products/000-docs/...`).

**Fix direction**: Global find-and-replace to `~/000-projects/agent-governance-plane/` across all 13 sites. The `003`:773–776 reference table also re-numbers the doc IDs (`006`, `007`, `008`, `009`) which presumably reflected the old shared-products `000-docs/` numbering — those need to be renumbered to the actual filenames (`001`, `002`, `003`, `004`).

**Cross-contradiction interaction**: Resolve before C8 (extraction strategy depends on whether AGP is a sibling of CCSC under a shared workspace or its own repo).

### C10 — Council authority vs Claude's role

**Severity: MEDIUM** (subtle — structurally accurate as a historical record, but misleading about ongoing authority)

Inventory: 001 L81, 101, 125, 145, 175 (`Decision (acting head of board): Q[1-5]` × 5), L231 (`## Final decisions (acting head of board)`), L261 (Claude's session.jsonl provenance), L265 (`I, Claude, acting in the capacity of head of board for the Intent Solutions Executive Decision Council session of 2026-05-27... hereby ratify the five decisions above`), L322 (`recorded by the acting head of board (Claude)`); 002 L4 (`author: Jeremy Longshore (Intent Solutions) · drafted by Claude as acting head of board`), L23 (`the locked CISO non-negotiables` *(implies binding authority)*).

**Fix direction**: Reframe "Claude as acting head of board ratifying decisions" to "Claude facilitated the ISEDC synthesis exercise; Jeremy owns and ratifies all decisions; Claude executes via Beads." Specifically, `001`:265 ("hereby ratify") and `001`:322 ("recorded by acting head of board") are the load-bearing self-grants of authority — they need to be reworded to "the council synthesis records the following recommendations to Jeremy" with Jeremy's own ratification stated separately.

## Banned-claim usage in foundation docs (orthogonal sweep)

20 hits across 001/002/003. Per the scope, **C6 is out of scope for this audit** (Epic 11 will handle the claim-control gates). Reported here as raw inventory for the C6 fix-team's reference. Heaviest concentration in `002`:179, 200, 289, 302 (the MARKETING_CLAIMS.md infrastructure section itself, which is allowed to enumerate the banned terms) and `003`:21, 215, 246, 474–477, 578, 631, 764 (operator audit narrative). The narrative uses (e.g. `003`:474–477) genuinely violate the rule and should be reframed; the registry definition (`002`:200, 289, 302) is the rule itself and stays.

## Demo language inventory

~26 hits, all already enumerated under **C2**. No additional sites outside C2.

## Fix-order recommendation

Tackle in this sequence — each step unlocks clean work on the next:

1. **C9 (path drift) FIRST.** Pure mechanical find-and-replace, 13 sites. Doing this first means subsequent edits don't fight with stale paths and avoids re-touching the same paragraphs twice.
2. **C10 (council authority).** Independent reframing of `001`'s ratification voice + `002`'s author byline. Doesn't conflict with any other fix.
3. **C1 + C2 jointly.** These are rhetorically fused throughout `002` §5.3 + `003` §2.1 + §7.2 + §11.5. Cannot fix one without the other. This is the biggest single block of multi-line surgery (~50–80 LoC of rewrite across both docs).
4. **C3 (version ladder).** Falls out naturally once C2 has reframed v0.2. The v0.2 row in `001`'s amendment table + `002`:271 §5.3 heading + `002`:300 v0.8 row + `003`:31 prose are the four anchor points.
5. **C8 (extraction strategy).** Defer until after C9 (path universe must be settled). Then reframe all "lift-and-shift" / "direct import" claims to "TBD by Epic 02 ADR." Fix the fabricated `src/kernel/*` paths in `003`:340–342.
6. **C7 (auth language).** Lowest-risk because it's localized to ~8 sites in `003` + 2 diagram boxes. Can run in parallel with C8.
7. **C4 (LoC).** Trivial last pass — single find-and-replace of `~12k` / `~13,000` → `~11,872`.

**Parallelization note**: C9 + C10 + C4 + C7 can all run in parallel (independent sites). C1 + C2 + C3 must be a single atomic edit. C8 waits on C9.

## Audit method

Read-only line-level grep + Read across the three foundation docs. No files modified.

- Jeremy Longshore
intentsolutions.io
