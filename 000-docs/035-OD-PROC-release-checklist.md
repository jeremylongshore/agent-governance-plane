# 035 — Release Checklist (AGP)

Operational checklist for cutting an AGP release. Epic 15 (`agp-upt`) deliverable.
The mechanical bump/tag/changelog is automated by `.github/workflows/release.yml`
(conventional-commit-driven); this checklist is the human-judgment layer around it.

## Before you tag

Run the aggregate gate:

```bash
bash scripts/release-validate.sh   # exits 0 only when release-ready
```

It must print `release-validate: PASS`. That single command runs every hard gate
(typecheck, lint, coverage, claim-scan, doc-drift, architecture, harness verify,
markdownlint) and confirms the release artifacts exist. Do not tag on a FAIL.

## Checklist

- [ ] `bash scripts/release-validate.sh` exits 0.
- [ ] **Claim scan**: `bash scripts/claim-scan.sh` clean — no v0-banned assurance
      terms on public surfaces; only the allowed claim is present.
- [ ] **Threat-model review**: re-read `000-docs/020-AT-THRT-*` against this
      release's changes. Any new attack surface is either defended or recorded as
      a known gap (below). No silent surface growth.
- [ ] **Docs sync**: README / AGENTS / CLAUDE reflect what shipped; every new
      `000-docs/NNN` is sequential and filed under the right `CC-ABCD` code.
- [ ] **Every epic closed in this release has an AAR** (see "AAR requirement").
- [ ] **Every bead closed in this release** has PR # + commit SHA + validation
      evidence on the bead (see `036-OD-SPEC-evidence-bundle-format`).
- [ ] **Release-blocking known-gaps review** completed (below).
- [ ] `CHANGELOG.md` and `version.txt` agree (release-validate checks this).

## AAR requirement

No epic closes without an After-Action Review. Author it from the template
`000-docs/011-OD-TMPL-aar-template.md`, filed as `000-docs/NNN-RA-AAR-<epic>-<date>.md`
(example precedent: `008-RA-AAR-agp-planning-cleanup-2026-05-27.md`). The epic bead
is closed with a reference to its AAR.

## Release-blocking known-gaps review

Before tagging, list any known gap that ships in this release and classify it:

| Class | Meaning | Action |
|---|---|---|
| Blocker | Violates a v0 invariant (fail-open, banned claim, broken gate) | Do NOT release; fix first. |
| Known limitation | Honest, documented, fail-closed (e.g. Docker-not-Firecracker isolation, restart re-issue) | Release OK; ensure it is stated in the threat doc + release notes. |
| Deferred | Tracked bead, post-v0 | Release OK; link the bead. |

A "known limitation" or "deferred" gap is only acceptable if it is written down
(threat doc + bead) — never shipped silently.

## After you tag

- [ ] GitHub release notes link the AARs for any epics closed in the release.
- [ ] Beads for shipped work are closed with evidence and mirrored (`bd-sync`).
- [ ] Gist / public one-pager refreshed if the release changes the public posture.
