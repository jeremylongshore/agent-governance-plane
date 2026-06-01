---
title: AAR Template — Epic / Release Closeout
date: 2026-06-01
author: Jeremy Longshore
type: Template (TMPL)
epic: Epic 01 — Establish the AGP repository (bead agp-7j5); consumed by Epic 15 release discipline (agp-upt)
status: Active template
---

# AAR Template — Epic / Release Closeout

> **How to use.** Copy this file to a new `000-docs/NNN-RA-AAR-<slug>-<date>.md`
> (allocate `NNN` at authoring time — check the next free number; don't reuse).
> Replace every `<…>` placeholder and delete the guidance blockquotes. Keep the
> section order. The Epic 00 closeout (`008-RA-AAR-agp-planning-cleanup`) is the
> reference instantiation of this template; Epic 15 (release discipline,
> `agp-upt`) reuses this format for per-release AARs.
>
> **Two rules that keep AARs honest:** (1) every "resolved" row cites real
> evidence — bead, GH issue, PR, commit; (2) deferred items go in the
> accepted-gaps table with a named owner, never silently dropped.

## Front matter to fill

```yaml
---
title: <Epic NN | Release vX.Y.Z> After-Action Report
date: <YYYY-MM-DD>
author: Jeremy Longshore
type: After-Action Report (AAR)
epic: <Epic NN — title (bead agp-xxx, GH #N)>   # omit for release AARs
verdict: <one-line outcome — what shipped, what was deferred>
---
```

## Executive summary

> 3–6 sentences: what this epic/release set out to do, what actually shipped,
> and the one or two judgment calls a future reader most needs to know.

<summary>

## Context

> Why this work existed and how it was approached. Link the driving docs (ADRs,
> audits, council records). For a release AAR, summarize the headline changes.

- <why it existed>
- <method / sequencing>
- <discipline / constraints honored>

## Delivered

> One row per shipped item. Every row carries traceable evidence. Use the
> columns that fit (drop "C#" for non-Epic-00 work).

| Item | Bead | GH issue | PR | Commit | Result |
|------|------|----------|----|--------|--------|
| <what> | `agp-xxx` | #N | #N | `sha` | <one-line outcome> |

## Accepted gaps (deferred, not dropped)

> Anything intentionally not done, with the reason and the owner who picks it up.
> If there are none, say "None" — don't delete the section.

| Item | Why it was deferred | Owner |
|------|---------------------|-------|
| <what> | <rationale> | <epic / upstream / person> |

## Verification

> Real command output, not assertions. Show the gates that prove the work.

```text
<command>
<output>
```

## What went well

- <thing that worked; keep it specific>

## What we would do differently

- <honest lesson; the next reader should be able to act on it>

## Remaining / forward work

- <follow-ups, with the bead or epic that tracks each>

## References

- <driving docs, related ADRs/AARs, upstream links>
