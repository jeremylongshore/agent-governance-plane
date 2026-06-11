# J1-governed-session.feature
#
# Gherkin specification for Journey J1: Operator runs a governed agent session.
# Maps to invariants INV-1 through INV-6 from 000-docs/002-PP-PLAN §5.
#
# This is a SPEC DOCUMENT (human-owned). The executable runner is
# tests/features/J1-governed-session.steps.test.ts (bun test).
# Engineer-owned: changes require deliberate re-pin via `scripts/audit-harness init`.

Feature: Operator runs a governed agent session
  As an operator running an agent harness through AGP
  I want every tool call to pass through the policy gate
  So that no tool executes without authorization and every decision is recorded

  # INV-1: default-deny — no matching rule blocks execution
  Scenario: Default-deny blocks an unmatched tool call
    Given the policy has no rule matching the requested tool
    When the agent requests that tool
    Then the policy engine returns a deny verdict
    And the tool is not executed

  # INV-2: signed journal — every call is recorded and verifies offline
  Scenario: A signed journal verifies offline after an allowed call
    Given a signing key pair is available
    And the policy allows the requested tool
    When the agent requests that tool
    And the daemon processes the request
    Then the journal contains the tool call event
    And the journal verifies with the public key

  # INV-3: require + no human — fails closed
  Scenario: A require call fails closed when no human is present
    Given the policy requires human approval for the requested tool
    And no human approval channel is connected
    When the agent requests that tool
    Then the approval request is denied
    And the tool is not executed

  # INV-3b: require + approval — executes after human approves
  Scenario: A require call executes after human approval
    Given the policy requires human approval for the requested tool
    And a human approval channel is connected and will approve
    When the agent requests that tool
    Then the approval is granted
    And the tool is executed

  # INV-3a: require + channel error — fails closed on timeout/drop
  Scenario: A require call fails closed when the approval channel errors
    Given the policy requires human approval for the requested tool
    And the approval channel will raise an error instead of deciding
    When the agent requests that tool
    Then the approval request is denied
    And the tool is not executed
    And the journal records the denial reason

  # INV-6: sessions are listable from the journal
  Scenario: Sessions are listed from the journal
    Given the policy allows the requested tool
    And a session has been run through the daemon
    When the operator lists sessions
    Then at least one session entry is returned
    And each entry includes a session id and start time

  # INV-1 + INV-2 live: real claude binary (off-CI — gated behind AGP_CLAUDE_LIVE)
  @gated
  Scenario: Live claude binary session is governed end-to-end
    Given the AGP_CLAUDE_LIVE environment variable is set
    And the claude binary is available on the PATH
    When a live claude-code sprite session runs through the daemon
    Then every tool call is recorded in a signed journal
    And only policy-allowed tools are executed
