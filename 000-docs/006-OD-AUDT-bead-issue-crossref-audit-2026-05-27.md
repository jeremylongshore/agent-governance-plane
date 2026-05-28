---
title: AGP Bead ↔ GitHub Issue Cross-Reference Audit
date: 2026-05-27
auditor: code-reviewer subagent (Claude Code, automated)
scope: Verify the integrity of Bead ID ↔ GitHub issue number cross-references across all 26 tracked pairs (16 parent epics + 10 Epic 00 children)
verdict: CLEAN (zero drift after the regex-bug recovery)
---

# AGP Bead ↔ GitHub Issue Cross-Reference Audit

## Verdict: CLEAN

All 26 bead/GH pairs are correctly linked. Zero drift found.

## Summary

**16 parent epics** (`agp-5l8` through `agp-upt` → GH #3 through #18): every bead's `Linked GH:` notes line points to the correct issue number, and every GH issue body's `**Bead:**` line carries the correct bead ID. All 16 are clean, no mismatches.

**10 Epic 00 children** (`agp-5l8.1` through `agp-5l8.10` → GH #19 through #28): all 10 child beads correctly link to their respective GH issues, and all 10 GH issue bodies carry the correct dotted child ID (e.g., `agp-5l8.4`, `agp-5l8.10`). The regex-bug recovery (see "Incident" below) was complete — no child issue still shows `agp-5l8` (the parent) in its `**Bead:**` line.

**Parent `agp-5l8` has exactly one GH link**: bead notes contain a single `GitHub: jeremylongshore/agent-governance-plane#3` line. No residue from the 10 wrongly-attributed children created by the regex bug.

**Test bead `agp-5l8.11` is CLOSED**: status shows `CLOSED` with reason "test bead created while diagnosing the parser regex bug — not a real child."

## Drift table

No rows — no drift found.

## Spot-check quotes

**Parent (GH #3):**

```
**Bead:** `agp-5l8`
```

**Mid-child (GH #22, C9 / agp-5l8.4):**

```
**Bead:** `agp-5l8.4`
**Parent Epic:** [Epic 00 — Canonicalize the AGP planning package](#3) (bead `agp-5l8`)
```

**AAR child (GH #28, agp-5l8.10):**

```
**Bead:** `agp-5l8.10`
**Parent Epic:** [Epic 00 — Canonicalize the AGP planning package](#3) (bead `agp-5l8`)
```

All three have the expected structure: `**Bead:**` line, parent epic back-reference (children), scope, internal docs, acceptance criteria, validation block, closure evidence section, and attribution footer. Coherent and complete.

## Incident: the regex-bug recovery

During initial Epic 00 child filing, the bead-ID parser used the pattern `\b(agp-[a-z0-9]+)\b`. Beads with dotted child IDs (e.g., `agp-5l8.1`) failed to parse correctly — the regex stopped at the `.`, capturing the parent prefix `agp-5l8` instead of the full child ID. Symptom: all 10 children's GH issues were bd-sync linked back to the *parent* bead, and all 10 child issue bodies showed `**Bead:** \`agp-5l8\`` instead of the correct dotted ID.

Recovery (executed during the same session):

- Stripped 10 wrongly-attributed GH links from parent `agp-5l8`'s notes (left only the legitimate #3 link).
- Ran `bd-sync link` for each child bead → correct GH issue.
- Edited each child GH issue body to replace `**Bead:** \`agp-5l8\`` with the correct child ID.
- Closed a stray test bead `agp-5l8.11` created while diagnosing the parser bug.

This audit confirms the recovery was complete.

## Audit method

- For each of 26 expected pairs (16 parents + 10 children): `bd show <bead-id>` confirmed bead exists; `bd-sync status <bead-id>` showed exact `Linked GH:` field; `gh issue view <num> --json body -q .body | grep -E '^\*\*Bead:'` showed exact `**Bead:**` line.
- For parent `agp-5l8` specifically: verified only `#3` listed in `Linked GH:`, not the regex-bug residue.
- Spot-checked 3 pairs end-to-end (one parent, one mid-child, the AAR child) by reading the full issue body to confirm structural completeness.
- Verified no bead claims to be linked to a GH issue that doesn't exist or vice versa.
- Verified `agp-5l8.11` (test bead) is CLOSED, not lingering open.

Read-only audit. No files modified.

## Recommended follow-up

Lock in the regex fix as a permanent guard:

- `bd create --parent <epic>` output parses `agp-NNN.M` (dotted child IDs) correctly going forward.
- Any future bead-filing automation MUST use a regex that matches `agp-[a-z0-9]+(\.[0-9]+)?` (or use `bd`'s JSON output mode) to capture dotted children.

This is a process lesson, not a code change to AGP itself.

- Jeremy Longshore
intentsolutions.io
