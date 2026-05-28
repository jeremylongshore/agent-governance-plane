<!--
AGP PR template — enforces the three-layer mirror discipline (Bead ↔ GitHub Issue ↔ Internal Docs).
Per AGP Phase B plan, every PR must reference its Bead ID, its GitHub issue, the docs it touches,
and the validation it ran. See CONTRIBUTING.md and /000-docs/0NN-AT-PROC-mirror-discipline-...md
(landing in Epic 01 / Epic 15) for the full rule.
-->

## Summary

<!-- 1-3 bullet points -->

-
-
-

## Mirror discipline (required)

- **Refs:** #<parent-epic-issue-number>
- **Closes:** #<this-issue-number>  <!-- if this PR retires a tracked issue -->
- **Bead:** `<actual bd ID, e.g. agp-5l8.4>` <!-- get from `bd list` or `bd show` — do NOT invent -->
- **Docs touched:** <!-- list every file under 000-docs/, README.md, MARKETING_CLAIMS.md, .github/ etc. -->
  -
- **Contradiction code (Epic 00 children only):** <!-- e.g. C1, C7, C10a -->

## Test plan

<!-- Each unchecked box blocks merge. Reviewers check the box only after seeing the evidence. -->

- [ ] `bash scripts/claim-scan.sh` exits 0 (no v0-banned claims on public surfaces)
- [ ] `bash scripts/doc-drift.sh` exits 0 OR documents the new violation in the bead notes
- [ ] `bash scripts/bead-validate.sh` shows the relevant bead's acceptance grep as PASS
- [ ] Validation commands listed in the bead's `Validation` section all pass locally (paste output)
- [ ] Markdown renders correctly on GitHub (preview the diff)

## Claim impact

<!--
Required. State explicitly:
- "No new marketing/security claims introduced." OR
- "Adds claim 'X' — registered in MARKETING_CLAIMS.md (Epic 11 work)" OR
- "Removes implicit claim 'Y' — see commit body for the removal trace."

This is the Epic 11 (claim-control) entry point. Every PR answers it.
-->

## Closure evidence (filled by author at merge time)

- PR #:
- Merge commit SHA:
- Validation output:
- AAR file path (if this PR closes an epic):

## Notes

<!-- Anything reviewers should know. Cross-PR dependencies, rebase order, follow-up beads filed for accepted gaps. -->

---

<!--
Footer is auto-applied by Claude Code attribution settings on commits and PR descriptions.
For issue/comment/review bodies (which are NOT covered by attribution), authors must manually append:

  - Jeremy Longshore
  intentsolutions.io
-->
