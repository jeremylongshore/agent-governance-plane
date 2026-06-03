# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.36] - 2026-06-03

### Changed

- ci(L1): add a pre-commit hook mirroring the CI gates (from /implement-tests) (#56) (af35161)

## [0.1.35] - 2026-06-03

### Changed

- test+docs: deep /audit-tests pass — RTM/personas/journeys + fix two real gaps (#55) (1fd9319)
- chore(beads): file backlog for deferred /audit-tests P1/P2 gaps (e4f9cb0)

## [0.1.34] - 2026-06-03

### Changed

- ci: enforce an aggregate test-coverage floor (from /audit-tests) (#54) (171e2e8)
- chore(beads): record bd-sync note interaction for Epic 06 milestone (4eb6982)
- chore(beads): close Epic 06 build children (agp-1lp/e4w/c0b/df6); file live-dogfood follow-on agp-3g0 (8b58fe2)

## [0.1.33] - 2026-06-03

### Added

- feat(epic06): Claude Code sprite — first real harness adapter, gate-only mediation (#53) (93fb344)

## [0.1.32] - 2026-06-03

### Changed

- chore(bd): resolve durability-timing decision — keep agp-4na.2/.3 post-v0 (89f0b13)

## [0.1.31] - 2026-06-03

### Changed

- chore(bd): conflict-review fixes for agp-4na hardening epic (7e2c38d)

## [0.1.30] - 2026-06-03

### Changed

- chore(bd): file peer-runtime audit governance-plane hardening epic (agp-4na, GH #52) (96ec190)
- chore(beads): close Epic 09 (agp-9r8) + policy bead agp-6z0 after #51 (e75e50b)

## [0.1.29] - 2026-06-03

### Added

- feat(epic09): production policy engine — strictest-wins, dangerous guard, doctor validation (#51) (d3d067a)

### Changed

- chore(beads): close Epic 10 (agp-qn7) + journal bead agp-oub after #49 (635e22c)

## [0.1.28] - 2026-06-03

### Added

- feat(epic10): harden audit journal — offline verifier, head checkpoint, pubkey verify, rotation (#49) (c9058c9)

### Changed

- chore(beads): close Epic 08 (agp-yep) + slack bead agp-9sk after #48 (ee65699)

## [0.1.27] - 2026-06-02

### Added

- feat(epic08): Slack channel adapter with nonce-bound HITL approvals (#48) (d74fa0c)

## [0.1.26] - 2026-06-02

### Changed

- chore(deps): bump DavidAnson/markdownlint-cli2-action from 18 to 23 (#37) (b093860)
- chore(beads): close Epic 07 (agp-yvo) + sandbox bead agp-aol after #47 (6742ed8)

## [0.1.25] - 2026-06-02

### Added

- feat(epic07): Docker sandbox provider — honest isolation, pinning, mount denial (#47) (13b14d5)

### Changed

- chore(beads): close agp-1hp (Epic 04 daemon runtime shipped in #46); note epic remainder (5347816)

## [0.1.24] - 2026-06-02

### Added

- feat(epic04): daemon orchestration + agp run/verify/sessions (reference subsystems) (#46) (6e9577f)

### Changed

- chore(beads): reconcile Epic 03 closed state in Dolt after rapid-write-race revert (fe46d1e)
- chore(beads): close Epic 03 (agp-nsd) + contract bead agp-6yj after #45 (e479e30)

## [0.1.23] - 2026-06-02

### Added

- feat(epic03): define the 6 AGP core contracts (zod schemas, fixtures, tests) (#45) (cb35cb3)

### Changed

- chore(beads): re-close agp-7vh after rapid-write-race revert (4e98263)
- chore(beads): close agp-eo8 (Epic 04 CLI foundation shipped in #44); note epic remainder (dae1c80)

## [0.1.22] - 2026-06-02

### Added

- feat(epic04): AGP CLI foundation — project, CI code-gates, fail-closed init/doctor (#44) (c2b6d2e)

### Changed

- chore(beads): close agp-7vh (Epic 02 decision shipped in #43); note epic remainder (1b62869)

## [0.1.21] - 2026-06-01

### Changed

- docs(epic02): accept vendor-subset ADR + establish substrate boundary contract (#43) (477b13f)
- chore(beads): re-close agp-1lf/um4/dz2 after rapid-write-race revert (5b92f88)
- chore(beads): close agp-dz2 (AAR template shipped in #42); note Epic 01/15 state (e19a5e3)

## [0.1.20] - 2026-06-01

### Changed

- docs(epic01): reusable AAR template for epic/release closeouts (#42) (8664618)
- chore(beads): close agp-ps3 (v0.2.0 rollback + pre-1.0 clamp shipped in #41) (c45bb59)

## [0.1.19] - 2026-06-01

### Added

- feat(epic11): MARKETING_CLAIMS registry + claims-as-code scanner (#40) (79afc92)

### Changed

- chore(beads): close agp-um4 (claim registry shipped in #40); note epic remainder (1f0572f)
- chore(beads): close agp-1lf (substrate-extraction ADR drafted in #39) (8c0e247)

### Fixed

- fix(release): roll back accidental v0.2.0 + clamp pre-1.0 auto-bumps to patch (#41) (a0d8641)

## [0.1.18] - 2026-06-01

### Changed

- docs(epic02): CCSC substrate-extraction strategy ADR (Proposed) (#39) (14a14a8)
- chore(beads): close Epic 00 (agp-5l8) and children .9/.10 after #38 merge (aefbb31)

## [0.1.17] - 2026-06-01

### Changed

- docs(epic00): planning-cleanup AAR + promote doc-drift to a hard gate (#38) (86f722f)
- chore(beads): close agp-q4v (release gate shipped in #36) (2719614)

## [0.1.16] - 2026-06-01

### Changed

- ci(release): gate auto-release on substantive commits (#36) (f258b8b)

## [0.1.15] - 2026-06-01

### Changed

- chore(beads): reconcile agp-4lb closed state in Dolt after branch-switch divergence (935f803)

## [0.1.14] - 2026-06-01

### Changed

- chore(beads): close agp-4lb (Keep a Changelog + release-workflow alignment shipped in #35) (d4bce98)

## [0.1.13] - 2026-06-01

### Fixed

- fix(release): Keep a Changelog conformance + conformant auto-entries; rewrite CLAUDE.md (#35) (b314e70)

## [0.1.12] - 2026-05-28

### Changed

- chore(deps): bump actions/checkout from 4 to 6 (#2) (e02c3fb)

## [0.1.11] - 2026-05-28

- chore(beads): close 8 Epic 00 child beads after PRs #29-#33 merged (f88e050)

## [0.1.10] - 2026-05-28

- fix(c3,c4): normalize Phase B version ladder + refresh live CCSC LoC (#33) (c2704ac)

## [0.1.9] - 2026-05-28

- fix(c1,c2): drop demo-first framing and Forrester deadline as build drivers (#32) (a69cb74)

## [0.1.8] - 2026-05-28

- fix(c10a,c10b): clarify decision authority hierarchy and ISEDC scope (#31) (5a8f61f)

## [0.1.7] - 2026-05-28

- fix(c9): normalize canonical AGP repo path + renumber doc cross-refs (#30) (1400892)

## [0.1.6] - 2026-05-28

- fix(c7): correct AGP auth language to match Claude Code session model (#29) (154a000)

## [0.1.5] - 2026-05-28

- chore(ci,docs): replace broken Node CI with docs-actually-validate workflow + tighten PR template + commit audit reports (#34) (f790dc4)

## [0.1.4] - 2026-05-28

- chore(beads): file Epic 00 child beads (C1-C10) + mirror to GH issues #19-#28 (f5b0511)

## [0.1.3] - 2026-05-28

- chore(beads): refresh issues.jsonl after Epic 00/01 description updates (91b849c)

## [0.1.2] - 2026-05-28

- docs(000-docs): replace /repo-dress placeholders with Phase A council foundation (b569e6c)

## [0.1.1] - 2026-05-28

- bd init: initialize beads issue tracking (18fad0c, f3ff2cf)

## [0.1.0] - 2026-05-28

### Added

- Initial governance dressing for agent-governance-plane (f59bd9c)
- README, LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, SUPPORT
- CI/CD workflows (markdown lint, banned-claim scan, doc-drift, release automation)
- Phase A council foundation docs in `000-docs/` (ISEDC decision record + master blueprint + operator audit + adversarial review)
- GitHub issue templates and PR template
- Dependabot configuration
- EditorConfig and gitattributes

[Unreleased]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.36...HEAD
[0.1.36]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.35...v0.1.36
[0.1.35]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.34...v0.1.35
[0.1.34]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.33...v0.1.34
[0.1.33]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.32...v0.1.33
[0.1.32]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.31...v0.1.32
[0.1.31]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.30...v0.1.31
[0.1.30]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.29...v0.1.30
[0.1.29]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.28...v0.1.29
[0.1.28]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.27...v0.1.28
[0.1.27]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.26...v0.1.27
[0.1.26]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.25...v0.1.26
[0.1.25]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.24...v0.1.25
[0.1.24]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.23...v0.1.24
[0.1.23]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.22...v0.1.23
[0.1.22]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.21...v0.1.22
[0.1.21]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.20...v0.1.21
[0.1.20]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.19...v0.1.20
[0.1.19]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.17...v0.1.18
[0.1.17]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.16...v0.1.17
[0.1.16]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.14...v0.1.15
[0.1.14]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.13...v0.1.14
[0.1.13]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/jeremylongshore/agent-governance-plane/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jeremylongshore/agent-governance-plane/releases/tag/v0.1.0
