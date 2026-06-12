<!--
  OWNERSHIP BOUNDARY — READ BEFORE EDITING
  ========================================
  This file is rebuilt by the rtm-builder-agent on every audit. Rows whose
  MoSCoW tier matches the source-document default are EXTRACTION-DERIVED and
  may be regenerated. If an engineer changes a MoSCoW tier away from the
  source default, mark the row with `[engineer-override]` in the Notes column
  and it will be preserved verbatim across rebuilds (an AI-proposed downgrade
  of a MUST is refused by the escape scanner).

  MoSCoW precedence: explicit source tag > source-document default
  (feature/ADR Decision = MUST, PROD doc = SHOULD) > engineer override wins
  over AI > inference of last resort (SHOULD, flagged for review).

  REQ IDs are STABLE across rebuilds — never renumber an existing ID.
-->

# Requirements Traceability Matrix — agent-governance-plane (AGP)

**Repo:** `/home/jeremy/000-projects/agent-governance-plane`
**Generated:** 2026-06-03 (initial build)
**Sources:** `000-docs/001-AT-DECR` (10 locked P0 decisions), `000-docs/002-PP-PLAN` (master blueprint: 4 defining properties §1, trust boundaries §2.2, threat model §4), `000-docs/009-AT-ADR` (CCSC substrate extraction), `000-docs/012-AT-SPEC` (CLI surface), `000-docs/013–018` (contract specs), `000-docs/019–027` (Docker sandbox, HITL flow, journal/audit-chain, policy integration, claude-code intendant), `src/contracts/`, `src/**/*.test.ts` (16 files, 87 tests).
**No Gherkin `.feature` files exist** — requirements extracted from blueprint properties, locked council decisions, ADRs/specs, contract modules, and the test suite.

## Coverage summary by MoSCoW tier

| Tier | Total | Covered | Uncovered | Excluded |
|---|---|---|---|---|
| **MUST** | 22 | 22 | **0** | — |
| **SHOULD** | 11 | 11 | 0 | — |
| **COULD** | 3 | 3 | 0 | — |
| **WON'T (v0)** | 5 | — | — | 5 |
| **Total** | 41 | 36 | 0 | 5 |

- **Uncovered MUSTs (P0):** none.
- **Orphaned tests:** none (every test file maps to ≥1 REQ).
- **Inferred-tag rows (engineer review):** none — every row traces to an explicit source default.

---

## MUST — governance & security invariants

These are the de-facto MUST requirements: the governance/security invariants the blueprint treats as load-bearing. Source-document default for a blueprint property / ADR Decision / spec invariant is MUST.

| REQ ID | Requirement | Tier | Source | Covering test(s) | Status |
|---|---|---|---|---|---|
| REQ-001 | **Default-deny / fail-closed policy:** a tool call with no matching rule is denied, never default-allowed. | MUST | 002-PP-PLAN §4; 025-AT-ADR (policy integration); `src/policy/engine.ts` | `src/policy/engine.test.ts` :: "no matching rule is default-deny (fail-closed) — dangerous tools never default-allow" | ✓ Covered |
| REQ-002 | **Dangerous ops never default-allow:** shell/write/network/secret/vcs tools are classified dangerous and a broad/wildcard auto-approve is flagged. | MUST | 002-PP-PLAN §4; 026-OD-EXAMP; `src/policy/dangerous.ts` | `src/policy/dangerous.test.ts` :: "classifies shell / write / network tools as dangerous"; "detectBroadAutoApprove warns on a wildcard allow"; "detectBroadAutoApprove warns on auto-approving a dangerous tool" | ✓ Covered |
| REQ-003 | **Strictest effect wins regardless of rule order:** deny beats require beats allow; priority only breaks ties within the same effect. | MUST | 025-AT-ADR (policy integration); `src/policy/engine.ts` | `src/policy/engine.test.ts` :: "STRICTEST effect wins regardless of rule order (deny beats allow)"; "require beats allow but loses to deny"; "priority breaks ties within the same effect" | ✓ Covered |
| REQ-004 | **Actor-scoped rules:** a rule's actor constraint correctly scopes which actor it applies to. | MUST | 025-AT-ADR; 014-AT-CONT (policy-verdict) | `src/policy/engine.test.ts` :: "actor constraint scopes a rule" | ✓ Covered |
| REQ-005 | **Malformed policy is FATAL, never silently ignored:** loading a bad policy aborts (fail-closed), it does not degrade to allow. | MUST | 025-AT-ADR; 002-PP-PLAN §4 | `src/policy/engine.test.ts` :: "loadPolicyEngine is FATAL on a malformed policy (never silently ignored)"; `src/policy/dangerous.test.ts` :: "validatePolicy flags duplicate rule ids and surfaces broad-approve warnings" | ✓ Covered |
| REQ-006 | **A `require` verdict must name its rule:** a require verdict without a `ruleId` is rejected (fail-closed contract invariant). | MUST | 014-AT-CONT (policy-verdict); `src/contracts/policy-verdict.ts` | `src/contracts/policy-verdict.test.ts` :: "a 'require' verdict without a ruleId is rejected (fail-closed invariant)"; "an unknown decision is rejected" | ✓ Covered |
| REQ-007 | **Signed, hash-chained journal verifies offline with the public key only.** | MUST | 002-PP-PLAN §1/§2.4; 024-AT-ARCH (audit chain); `src/journal/journal.ts` | `src/journal/journal.test.ts` :: "a valid journal verifies offline with the PUBLIC key only" | ✓ Covered |
| REQ-008 | **Journal detects payload tamper (EDIT):** mutating an event payload breaks its hash. | MUST | 024-AT-ARCH; 002-PP-PLAN §4 | `src/journal/journal.test.ts` :: "catches an EDIT (payload tamper → hash mismatch)" | ✓ Covered |
| REQ-009 | **Journal detects INSERTION / REORDER:** an extra or swapped event breaks seq + chain linkage. | MUST | 024-AT-ARCH | `src/journal/journal.test.ts` :: "catches an INSERTION (extra event breaks seq + chain)"; "catches a REORDER (swapped events)" | ✓ Covered |
| REQ-010 | **Journal detects an INVALID / FORGED signature** (event signature and head checkpoint). | MUST | 024-AT-ARCH; 013-AT-CONT (journal-event) | `src/journal/journal.test.ts` :: "catches an INVALID SIGNATURE"; "catches a FORGED HEAD checkpoint (signature invalid)" | ✓ Covered |
| REQ-011 | **Journal detects TRUNCATION:** removing the tail is caught because the signed head still pins it. | MUST | 024-AT-ARCH §partition/checkpoint; 002-PP-PLAN §2.4 | `src/journal/journal.test.ts` :: "catches TRUNCATION (tail removed, signed head still pins it)" | ✓ Covered |
| REQ-012 | **No signed→unsigned rollback:** a v1/unsigned event in a v0 chain is rejected; v0 requires the signed v2 event shape. | MUST | 023-AT-SPEC (journal-event schema); 013-AT-CONT | `src/journal/journal.test.ts` :: "catches a SIGNED→UNSIGNED ROLLBACK (v1/unsigned event)"; `src/contracts/journal-event.test.ts` :: "rejects a v1 (unsigned) event — v0 requires signed v2"; "rejects an event without a signature" | ✓ Covered |
| REQ-013 | **Journal-event schema is strict & forward-compatible:** unknown fields rejected; malformed hash rejected; genesis may have null prevHash, non-genesis must be a hash. | MUST | 023-AT-SPEC; 013-AT-CONT; `src/contracts/journal-event.ts` | `src/contracts/journal-event.test.ts` :: "a valid v0 signed journal event parses unchanged"; "rejects a malformed hash"; "rejects unknown fields (strict schema)"; "genesis event may have a null prevHash; non-genesis must be a hash" | ✓ Covered |
| REQ-014 | **Reserved schema slots present and null at v0** (`tenant_id`, `signing_key_id`, `approval_binding_type`, `intendant_identity_uri`) — CISO non-negotiable, locking now so activation is not a breaking change. | MUST | 001-AT-DECR Q2 binding constraint; 023-AT-SPEC §Reserved | `src/contracts/journal-event.test.ts` :: "reserves all four future fields, present and null at v0 (council lock)"; "reserved fields default to null when omitted (forward-compatible slot)" | ✓ Covered |
| REQ-015 | **Slack approval replay rejection:** a consumed nonce cannot be consumed again; a nonce bound to one request is rejected for another; expired nonces rejected; a replayed click on an already-approved request is denied. | MUST | 022-AT-ARCH (HITL flow); 021-AT-SPEC (slack adapter); `src/channels/slack/nonce-store.ts` | `src/channels/slack/replay-attack.test.ts` :: "a consumed nonce cannot be consumed again (replay rejected)"; "a nonce bound to one request is rejected for another"; "an expired nonce is rejected"; "a replayed click on an already-approved request is denied" | ✓ Covered |
| REQ-016 | **Bot-reject on approval:** a peer bot cannot approve, and a bot click does not burn the nonce (a real human can still approve). | MUST | 022-AT-ARCH; 021-AT-SPEC | `src/channels/slack/slack-channel.test.ts` :: "a peer bot cannot approve, and does not burn the nonce" | ✓ Covered |
| REQ-017 | **HITL human Approve/Deny semantics:** a nonce-bound Block Kit prompt is posted; a human Approve yields approved, a human Deny yields denied. | MUST | 022-AT-ARCH; 015-AT-CONT (gateway-message) | `src/channels/slack/slack-channel.test.ts` :: "postApprovalRequest posts a nonce-bound Block Kit prompt with Approve/Deny"; "a human Approve click yields an approved decision"; "a human Deny click yields a denied decision" | ✓ Covered |
| REQ-018 | **Gate-only mediation for the live harness (no proxy-exec):** the Claude Code intendant passes each read/write/shell/git call through the gate and journals it; the harness executes its own tools — AGP never proxy-executes. A denied call returns allow=false with a reason and the harness keeps running; an unmatched call is default-denied at the gate. | MUST | 027-AT-SPEC (claude-code intendant §Gate-only); 016-AT-CONT (intendant-adapter); 002-PP-PLAN §2.2 | `src/intendants/claude-code/claude-code-intendant.test.ts` :: "read/write/shell/git calls each pass through the gate and are journaled, gate-only (no proxy-exec)"; "a denied call is blocked: the hook receives allow=false with the reason, harness keeps running"; "an unmatched call is default-denied (fail-closed) at the gate" | ✓ Covered |
| REQ-019 | **Honest Docker isolation (not VM-grade):** sandbox disables network by default (fail-closed) and hardens the container; isolation guarantees are honestly reported as not VM-grade; a failed `docker run` throws and NEVER falls back to host execution. | MUST | 019-AT-ARCH (docker sandbox); 020-AT-THRT (isolation limits); 017-AT-CONT (sandbox-provider); 002-PP-PLAN §4 | `src/sandbox/docker/docker-sandbox.test.ts` :: "spawn disables network by default (fail-closed) and hardens the container"; "a failed `docker run` throws — never falls back to host execution"; "isolation() is honest: not vm-grade"; `src/contracts/behavioral.test.ts` :: "SandboxSpec defaults networkEnabled to false (fail-closed)"; "IsolationGuarantees for a container is honestly not vm-grade" | ✓ Covered |
| REQ-020 | **Image-pin + mount validation:** moving-tag/untagged images rejected, pinned + digest accepted; host-secret mount paths denied, benign mounts allowed; network bridge enabled only when explicitly requested. | MUST | 019-AT-ARCH §Hardening; 020-AT-THRT | `src/sandbox/docker/docker-sandbox.test.ts` :: "rejects a moving-tag image and an untagged image; accepts pinned + digest"; "denies mounting a host-secret path; allows a benign mount"; "spawn enables bridge network only when explicitly requested" | ✓ Covered |
| REQ-021 | **Reuse Claude Code login session / no Anthropic API key:** the intendant reuses the operator's login session; AGP holds no Anthropic API key; process builders are pure and login-session based. | MUST | 027-AT-SPEC §Authentication; 001-AT-DECR Q1 (no API-key dependency); 002-PP-PLAN §2.1 | `src/intendants/claude-code/claude-code-intendant.test.ts` :: "BunClaudeProcess builders are pure and login-session based (no API key)"; "BunClaudeProcess live spawn is gated behind AGP_CLAUDE_LIVE" | ✓ Covered |
| REQ-022 | **Daemon end-to-end fail-closed mediation:** an allowed call is executed, journaled, and the journal verifies; a denied call is NOT executed (dangerous default path); a `require` call is denied by the fail-closed console channel when no human present, and executes only once a human approves. | MUST | 022-AT-ARCH; 025-AT-ADR; 024-AT-ARCH; `src/daemon/daemon.ts` | `src/daemon/daemon.test.ts` :: "an allowed tool call is executed, journaled, and the journal verifies"; "a denied tool call is NOT executed (the dangerous default path)"; "a 'require' call is denied by the fail-closed console channel (no human)"; "a 'require' call executes only once a human approves"; `src/intendants/claude-code/claude-code-intendant.test.ts` :: "a 'require' call is approved by a human channel, and the hook is then allowed"; "a 'require' call is denied by the fail-closed channel when no human is present" | ✓ Covered |

---

## SHOULD — onboarding, CLI surface, contract conformance

Source-document default for CLI-surface spec items and operability requirements is SHOULD (they are operability/onboarding, not security invariants).

| REQ ID | Requirement | Tier | Source | Covering test(s) | Status |
|---|---|---|---|---|---|
| REQ-023 | **`agp doctor` is fail-closed:** passes only when every check passes, fails closed on any single failure, and reports every failure (not just the first). | SHOULD | 012-AT-SPEC §`agp doctor`; `src/cli/checks.ts` | `src/cli/checks.test.ts` :: "runDoctor passes only when every check passes (happy path)"; "runDoctor fails closed when a single check fails (failure path)"; "runDoctor reports every failure, not just the first" | ✓ Covered |
| REQ-024 | **`agp doctor` probes fail-closed per prerequisite:** signing key absent → fail until present; policy missing/non-JSON/rules-less rejected; Slack requires bot+app token+channel; unconfigured home → non-zero. | SHOULD | 012-AT-SPEC §`agp doctor`; `src/cli/probe.ts` | `src/cli/probe.test.ts` :: "signing() fails closed when the key is absent, passes once present"; "policy() rejects missing, non-JSON, and rules-less files (unsafe-config rejection)"; "slack() requires all of bot token, app token, and channel"; "doctorCommand returns non-zero on an unconfigured home (fail-closed end to end)" | ✓ Covered |
| REQ-025 | **`agp init` scaffolds config/policy/signing dir idempotently** and does not clobber existing files without `--force`. | SHOULD | 012-AT-SPEC §`agp init`; `src/cli/commands/init.ts` | `src/cli/init.test.ts` :: "init creates the config + policy skeletons and the signing dir"; "init does not clobber existing files without --force, but does with it" | ✓ Covered |
| REQ-026 | **`agp verify` verifies a journal offline** (exit 0 valid, non-zero on tamper with a report), accepts an explicit path arg, and fails closed when no verification key exists. | SHOULD | 012-AT-SPEC §`agp verify`; 024-AT-ARCH; `src/cli/commands/verify.ts` | `src/cli/verify.test.ts` :: "agp verify exits 0 on a valid journal (offline, public key from keygen)"; "agp verify exits non-zero on tampering and reports it"; "agp verify accepts an explicit journal path argument"; "agp verify fails closed when no verification key exists" | ✓ Covered |
| REQ-027 | **PolicyVerdict contract:** allow parses; a require verdict that names its rule parses; ruleId/tier default to null for a no-rule-matched allow. | SHOULD | 014-AT-CONT; `src/contracts/policy-verdict.ts` | `src/contracts/policy-verdict.test.ts` :: "an allow verdict parses"; "a require verdict that names its rule parses"; "ruleId and tier default to null for a no-rule-matched allow" | ✓ Covered |
| REQ-028 | **GatewayMessage contract:** a `tool_call_request` parses and keeps its discriminator; each message kind round-trips through the union; an unknown kind is rejected; a request missing its tool is rejected. | SHOULD | 015-AT-CONT; `src/contracts/gateway-message.ts` | `src/contracts/gateway-message.test.ts` :: "a tool_call_request parses and keeps its discriminator"; "each message kind round-trips through the union"; "an unknown kind is rejected"; "a tool_call_request missing its tool is rejected" | ✓ Covered |
| REQ-029 | **IntendantAdapter contract conformance:** a reference IntendantAdapter conforms and drives a session; IntendantIdentity parses with `uri` reserved (null) at v0. | SHOULD | 016-AT-CONT; 027-AT-SPEC; `src/contracts/intendant-adapter.ts` | `src/contracts/behavioral.test.ts` :: "a reference IntendantAdapter conforms and drives a session"; "IntendantIdentity parses; uri reserved (null) at v0" | ✓ Covered |
| REQ-030 | **SandboxProvider contract conformance:** a reference SandboxProvider spawns/execs/tears down; exec surfaces a process failure as non-zero exit (not thrown); teardown force-removes the container. | SHOULD | 017-AT-CONT; 019-AT-ARCH; `src/contracts/sandbox-provider.ts` | `src/contracts/behavioral.test.ts` :: "a reference SandboxProvider spawns/execs/tears down"; `src/sandbox/docker/docker-sandbox.test.ts` :: "exec surfaces a process failure as a non-zero exit (not thrown)"; "teardown force-removes the container" | ✓ Covered |
| REQ-031 | **ChannelAdapter contract conformance:** a reference ChannelAdapter posts, awaits, and projects (best-effort). | SHOULD | 018-AT-CONT; `src/contracts/channel-adapter.ts` | `src/contracts/behavioral.test.ts` :: "a reference ChannelAdapter posts, awaits, and projects (best-effort)" | ✓ Covered |
| REQ-032 | **ApprovalRequest contract:** accepts a `require` verdict, rejects a non-require one. | SHOULD | 014-AT-CONT; 022-AT-ARCH | `src/contracts/behavioral.test.ts` :: "ApprovalRequest accepts a require verdict, rejects a non-require one" | ✓ Covered |
| REQ-033 | **Session-id binding for run:** `run(sessionId)` must match the started session; `stop()` terminates the session — pending hooks unblock as denied and remaining calls do not run. | SHOULD | 027-AT-SPEC; 016-AT-CONT | `src/intendants/claude-code/claude-code-intendant.test.ts` :: "run(sessionId) must match the started session"; "stop() terminates the session: pending hooks unblock as denied and remaining calls do not run" | ✓ Covered |

---

## COULD — projection & session-bracketing niceties

| REQ ID | Requirement | Tier | Source | Covering test(s) | Status |
|---|---|---|---|---|---|
| REQ-034 | **Slack projection is best-effort:** `projectEvent` returns true on success, false on failure, and never throws (projection is non-authoritative per §2.4). | COULD | 002-PP-PLAN §2.4; 021-AT-SPEC | `src/channels/slack/slack-channel.test.ts` :: "projectEvent is best-effort: returns true on success, false on failure, never throws" | ✓ Covered |
| REQ-035 | **Session bracketing:** `runScripted` brackets the session with started/ended journal events. | COULD | 022-AT-ARCH; 024-AT-ARCH | `src/daemon/daemon.test.ts` :: "runScripted brackets the session with started/ended journal events" | ✓ Covered |
| REQ-036 | **Live spawn is gated behind an opt-in env flag** (`AGP_CLAUDE_LIVE`) so the default path is deterministic/offline. | COULD | 027-AT-SPEC | `src/intendants/claude-code/claude-code-intendant.test.ts` :: "BunClaudeProcess live spawn is gated behind AGP_CLAUDE_LIVE" | ✓ Covered |

---

## WON'T (v0) — explicitly deferred operational-reliability items

These are explicitly deferred by the blueprint at v0; they are recorded as Excluded so a future rebuild does not flag them as uncovered. Activating them is a later-vN milestone, not a v0 gap.

| REQ ID | Requirement | Tier | Source | Status |
|---|---|---|---|---|
| REQ-037 | **Exactly-once tool execution / durable sessions:** control-plane crash mid-tool-call replays only on explicit operator resume; otherwise logged as orphaned. v0 does not promise exactly-once. | WON'T (v0) | 002-PP-PLAN §2.3 | Excluded |
| REQ-038 | **Cross-chain causality / cross-tenant attestation** ("approved by Bob" linkable across journals) — requires per-tenant signing keys + witness service. | WON'T (v0) | 002-PP-PLAN §2.3; 004-AR-CANN | Excluded — deferred to v0.3+ |
| REQ-039 | **Operator nonrepudiation / third-party witness:** a malicious operator forges entries with their own key; v0 makes no claim against this. | WON'T (v0) | 002-PP-PLAN §4.1 | Excluded — structurally requires witness service |
| REQ-040 | **Multi-tenant isolation + per-tenant KMS signing:** v0 is single-tenant only; running v0 multi-tenant is unsafe by design. | WON'T (v0) | 001-AT-DECR Q3; 002-PP-PLAN §4.1/§4.2 | Excluded — `gate()` rewrite + KMS land v0.1/v0.3 |
| REQ-041 | **VM-grade sandbox isolation / sandbox-escape defense:** Docker namespace isolation only (documented weak); real isolation requires Firecracker/Unikraft. | WON'T (v0) | 002-PP-PLAN §4.1; 020-AT-THRT | Excluded — deferred to v0.3+ |

---

## Orphaned tests

None. All 16 test files map to ≥1 REQ:

| Test file | Maps to |
|---|---|
| `src/policy/engine.test.ts` | REQ-001, 003, 004, 005 |
| `src/policy/dangerous.test.ts` | REQ-002, 005 |
| `src/contracts/policy-verdict.test.ts` | REQ-006, 027 |
| `src/journal/journal.test.ts` | REQ-007–011 |
| `src/contracts/journal-event.test.ts` | REQ-012, 013, 014 |
| `src/channels/slack/replay-attack.test.ts` | REQ-015 |
| `src/channels/slack/slack-channel.test.ts` | REQ-016, 017, 034 |
| `src/intendants/claude-code/claude-code-intendant.test.ts` | REQ-018, 021, 022, 033, 036 |
| `src/sandbox/docker/docker-sandbox.test.ts` | REQ-019, 020, 030 |
| `src/contracts/behavioral.test.ts` | REQ-019, 029, 030, 031, 032 |
| `src/daemon/daemon.test.ts` | REQ-022, 035 |
| `src/cli/checks.test.ts` | REQ-023 |
| `src/cli/probe.test.ts` | REQ-024 |
| `src/cli/init.test.ts` | REQ-025 |
| `src/cli/verify.test.ts` | REQ-026 |
| `src/contracts/gateway-message.test.ts` | REQ-028 |

---

## Regulated overlay

`TESTING.md#Compliance overlay` is not present in this repo (no `tests/TESTING.md` yet). Normal severities apply: uncovered SHOULD = P1, uncovered COULD = P2, orphans = P1/P2. No overlay escalation engaged.
