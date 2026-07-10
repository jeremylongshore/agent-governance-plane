<!-- markdownlint-disable -->
# PERSONAS.md — agent-governance-plane (AGP)

> Persona-to-flow traceability for the IS Testing SOP.
> The **declaration block** for each persona (name, tier, permissions, `Key flows:`,
> `Critical:`) is engineer-owned — edit it by hand. The **observational block**
> (`Test coverage:` lines + `Coverage: X/Y`) is rebuilt each audit by the
> persona-coverage agent; do not hand-edit it.
>
> Thresholds (defaults; `tests/TESTING.md` is absent so defaults apply):
> `flow_coverage_min = 80%` · `critical_flow_coverage_min = 100%`.
> A flow counts as covered if at least one `src/**/*.test.ts` test exercises it.
> Source provenance for the primary persona: `000-docs/002-PP-PLAN-...` §5.1.

---

## Persona: operator (`primary`)

```
Name:        operator — "Jeremy in his truck"
Tier:        primary (v0 — single-operator, self-hosted)
Critical:    true
Permissions: full control of own ~/.agp config home, signing key, and policy;
             session_owner actor in the policy engine; sole human who approves
             or denies tool calls in Slack. Holds no Anthropic API key (the
             Claude Code intendant reuses the operator's own Claude login).
Key flows:
  - init-config-and-mint-key   : `agp init` scaffolds ~/.agp + `agp keygen` mints the Ed25519 signing key
  - doctor-fail-closed         : `agp doctor` validates Docker/Slack/signing/policy prerequisites, fail-closed
  - run-governed-session       : `agp run` drives a session through the policy gate + sandbox + journal loop
  - slack-approval-prompt      : a policy-flagged ("require") op posts a nonce-bound Block Kit Allow/Deny prompt to Slack
  - approve-or-deny            : the operator's Approve/Deny click yields the decision; default-deny when no human, replay-proof
  - dangerous-op-classification: rm / git push --force / arbitrary shell classified dangerous and never default-allowed
  - verify-signed-journal      : `agp verify` checks the hash chain + signatures + signed head offline, with the public key only
  - list-sessions              : `agp sessions` reconstructs recorded sessions from the journal
  - live-dogfood-e2e           : real `claude` binary spawned in the Docker sandbox against a live CCSC bug, end to end
  - run-governed-watch         : `agp watch run` fires one trigger tick — committed spec -> mediate() (read=allow, act=require+HITL) -> dedup state -> journal brackets; `status` = dead-man's-switch; `enable` = human reset (Slice 0, Intendants)
```

<!-- BEGIN observational (agent-maintained) -->
```
Test coverage:
  - init-config-and-mint-key   : COVERED  — src/cli/init.test.ts (creates config+policy skeletons, signing dir; no-clobber vs --force);
                                            src/cli/verify.test.ts::seededHome (keygen mints private+public key);
                                            commands: src/cli/commands/init.ts, src/cli/commands/keygen.ts
  - doctor-fail-closed         : COVERED  — src/cli/checks.test.ts (runDoctor passes only all-ok; fails closed on one fail; reports every failure);
                                            src/cli/probe.test.ts (signing/policy/slack probes; doctorCommand non-zero on unconfigured home);
                                            commands: src/cli/commands/doctor.ts, src/cli/checks.ts, src/cli/probe.ts
  - run-governed-session       : COVERED  — src/daemon/daemon.test.ts (allow->executed+journaled+verifies; started/ended bracketing);
                                            command: src/cli/commands/run.ts (REFERENCE mode: scripted intendant + recording sandbox)
  - slack-approval-prompt      : COVERED  — src/channels/slack/slack-channel.test.ts (postApprovalRequest posts nonce-bound Block Kit Approve/Deny)
  - approve-or-deny            : COVERED  — src/channels/slack/slack-channel.test.ts (human Approve->approved; Deny->denied; bot cannot approve);
                                            src/daemon/daemon.test.ts (require denied fail-closed with no human; executes only on approve);
                                            src/channels/slack/replay-attack.test.ts (one-time nonce; wrong-request bind; expiry; replayed click denied)
  - dangerous-op-classification: COVERED  — src/policy/dangerous.test.ts (shell/write/network classified dangerous, Read not; broad-approve warnings);
                                            src/policy/engine.test.ts (default-deny fail-closed; deny>require>allow; actor scoping; fatal on bad policy)
  - verify-signed-journal      : COVERED  — src/cli/verify.test.ts (exit 0 valid / non-zero+x on tamper / explicit path / fail-closed no key);
                                            src/journal/journal.test.ts (offline public-key verify; edit/insert/reorder/bad-sig/rollback/truncation/forged-head)
  - list-sessions              : COVERED  — exercised via src/daemon/daemon.test.ts session.started/ended events;
                                            command src/cli/commands/sessions.ts (no dedicated *.test.ts -- reconstruction asserted only through daemon events)
  - live-dogfood-e2e           : UNTESTED — gated off-CI behind AGP_CLAUDE_LIVE (src/cli/commands/run.ts fails closed when AGP_CLAUDE_LIVE=1;
                                            BunClaudeProcess live spawn not run in CI). Tracked open: bead agp-3g0 (Epic 06 final acceptance)
  - run-governed-watch         : COVERED  — src/cli/commands/watch.test.ts (fail-closed spec/key/policy; honest reference failure + journal brackets;
                                            restart-intensity refusal + human enable; status stale/broken exits); src/daemon/daemon-run-mediated.test.ts
                                            (proxy-exec, require+HITL, crash teardown); templates/github-watcher/tests/{unit,policy,state,acceptance}.test.ts
                                            (zero duplicate alerts across consecutive runs; deny->suppressed; offline verify + cross-chain pointer).
                                            Live Docker+Slack leg gated off-CI (Slice-0 standing-gate dogfood, bead agp-eva.1.5)
```

```
Coverage: 9/10 flows (90.0%) -- at/above 80% flow threshold; BELOW 100% critical-flow threshold (1 uncovered: live-dogfood-e2e, off-CI by design).
```
<!-- END observational (agent-maintained) -->

---

## Persona: small-dev-team (`deferred`)

```
Name:        small-dev-team (1-5 engineers self-hosting on a VPS)
Tier:        deferred (v0.1+ -- NOT a v0 audience)
Critical:    false
Permissions: (not yet designed -- multi-operator approval routing, shared
             config, and per-engineer identity are deferred behind shipped
             primitives per 000-docs/001 CISO non-negotiables)
Key flows:   (none declared at v0 -- deferred)
```

<!-- BEGIN observational (agent-maintained) -->
```
Test coverage:
  (no flows declared -- deferred persona; not scored)
```

```
Coverage: n/a (deferred -- 0 flows declared)
```
<!-- END observational (agent-maintained) -->

---

## Explicitly out of scope at v0

Per `000-docs/002` "Who it's for": compliance shops, platform engineering at
mid-size companies, and enterprise CISOs are **not** v0 audiences. They are
deferred behind explicit shipped-primitive gates (WebAuthn, per-tenant KMS,
Sigstore signing) and carry no personas or flows here.
