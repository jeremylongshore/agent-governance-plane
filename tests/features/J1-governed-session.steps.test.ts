// J1-governed-session.steps.test.ts
//
// Bun test runner for J1-governed-session.feature.
// Each test is named after the Gherkin scenario it exercises and makes
// real assertions against the actual governance modules — no stubs, no
// tautological expects.
//
// DI idiom: RecordingSandbox, ConsoleChannel, PolicyEngine, Journal, Daemon —
// the same fakes used in src/daemon/daemon.test.ts. No live Docker, no live
// Slack, no real claude binary in CI.
//
// The @gated live scenario is test.skip'd with an explicit bead reference
// (mirrors the pattern in claude-code-sprite.test.ts).

import { test, expect, describe } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";

import { Daemon } from "../../src/daemon/daemon.ts";
import { Journal, readEvents } from "../../src/journal/journal.ts";
import { verifyJournalFile } from "../../src/journal/verify.ts";
import { PolicyEngine, type PolicyRule } from "../../src/policy/engine.ts";
import { RecordingSandbox } from "../../src/runtime/sandbox.ts";
import { ConsoleChannel } from "../../src/runtime/channel.ts";
import { ScriptedSprite } from "../../src/runtime/sprite.ts";
import { generateSigningKeyPem, loadPrivateKey, publicKeyFromPrivate } from "../../src/runtime/crypto.ts";
import { sessionsCommand } from "../../src/cli/commands/sessions.ts";
import { resolvePaths } from "../../src/config.ts";
import type { ChannelAdapter } from "../../src/contracts/channel-adapter.ts";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface StepHarness {
  dir: string;
  journalPath: string;
  pub: KeyObject;
  daemon: Daemon;
  sandbox: RecordingSandbox;
  cleanup: () => void;
}

function makeHarness(
  rules: PolicyRule[],
  env: Record<string, string | undefined> = {},
  channel?: ChannelAdapter,
): StepHarness {
  const dir = mkdtempSync(join(tmpdir(), "agp-j1-"));
  const journalPath = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const pub = publicKeyFromPrivate(priv);
  const journal = new Journal(journalPath, priv, () => "2026-06-07T00:00:00.000Z");
  const sandbox = new RecordingSandbox();
  const resolvedChannel = channel ?? new ConsoleChannel(env, () => {});
  const daemon = new Daemon({
    policy: new PolicyEngine(rules),
    journal,
    sandbox,
    channel: resolvedChannel,
  });
  return {
    dir,
    journalPath,
    pub,
    daemon,
    sandbox,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Feature: Operator runs a governed agent session
// ---------------------------------------------------------------------------

describe("Feature: Operator runs a governed agent session", () => {
  // Scenario: Default-deny blocks an unmatched tool call (INV-1)
  test("Scenario: Default-deny blocks an unmatched tool call", async () => {
    // Given the policy has no rule matching the requested tool
    const h = makeHarness([]); // empty rules → default-deny applies
    try {
      // When the agent requests that tool
      const result = await h.daemon.runScripted(
        new ScriptedSprite([{ tool: "Bash", args: { command: "ls" } }]),
        { sessionId: "j1-s1" },
      );
      // Then the policy engine returns a deny verdict
      expect(result.outcomes).toHaveLength(1);
      const outcome = result.outcomes[0]!;
      expect(outcome.verdict.decision).toBe("deny");
      expect(outcome.verdict.reason).toContain("default-deny");
      // And the tool is not executed
      expect(outcome.executed).toBe(false);
      expect(h.sandbox.recorded).toHaveLength(0);
    } finally {
      h.cleanup();
    }
  });

  // Scenario: A signed journal verifies offline after an allowed call (INV-2)
  test("Scenario: A signed journal verifies offline after an allowed call", async () => {
    // Given a signing key pair is available (implicit — harness generates one)
    // And the policy allows the requested tool
    const h = makeHarness([{ id: "allow-read", effect: "allow", tool: "Read" }]);
    try {
      // When the agent requests that tool and the daemon processes the request
      const result = await h.daemon.runScripted(
        new ScriptedSprite([{ tool: "Read", args: { path: "/etc/hostname" } }]),
        { sessionId: "j1-s2" },
      );
      // Then the journal contains the tool call event
      expect(result.outcomes).toHaveLength(1);
      expect(result.outcomes[0]!.verdict.decision).toBe("allow");
      const events = readEvents(h.journalPath);
      const toolEvents = events.filter((e) => e.kind === "tool_call.allow");
      expect(toolEvents.length).toBeGreaterThanOrEqual(1);
      expect(toolEvents[0]!.payload.tool).toBe("Read");
      // And the journal verifies with the public key
      const verification = verifyJournalFile(h.journalPath, h.pub);
      expect(verification.ok).toBe(true);
    } finally {
      h.cleanup();
    }
  });

  // Scenario: A require call fails closed when no human is present (INV-3)
  test("Scenario: A require call fails closed when no human is present", async () => {
    // Given the policy requires human approval for the requested tool
    // And no human approval channel is connected (ConsoleChannel with no AGP_AUTO_APPROVE)
    const h = makeHarness([{ id: "req-write", effect: "require", tool: "Write" }], {});
    try {
      // When the agent requests that tool
      const result = await h.daemon.runScripted(
        new ScriptedSprite([{ tool: "Write", args: { path: "/tmp/x", content: "y" } }]),
        { sessionId: "j1-s3" },
      );
      // Then the approval request is denied
      expect(result.outcomes[0]!.verdict.decision).toBe("require");
      expect(result.outcomes[0]!.approved).toBe(false);
      // And the tool is not executed
      expect(result.outcomes[0]!.executed).toBe(false);
      expect(h.sandbox.recorded).toHaveLength(0);
    } finally {
      h.cleanup();
    }
  });

  // Scenario: A require call executes after human approval (INV-3b)
  test("Scenario: A require call executes after human approval", async () => {
    // Given the policy requires human approval for the requested tool
    // And a human approval channel is connected and will approve (AGP_AUTO_APPROVE=1)
    const h = makeHarness(
      [{ id: "req-write", effect: "require", tool: "Write" }],
      { AGP_AUTO_APPROVE: "1" },
    );
    try {
      // When the agent requests that tool
      const result = await h.daemon.runScripted(
        new ScriptedSprite([{ tool: "Write", args: { path: "/tmp/x", content: "y" } }]),
        { sessionId: "j1-s4" },
      );
      // Then the approval is granted
      expect(result.outcomes[0]!.approved).toBe(true);
      // And the tool is executed
      expect(result.outcomes[0]!.executed).toBe(true);
      expect(h.sandbox.recorded).toHaveLength(1);
    } finally {
      h.cleanup();
    }
  });

  // Scenario: A require call fails closed when the approval channel errors (INV-3a)
  test("Scenario: A require call fails closed when the approval channel errors", async () => {
    // Given the policy requires human approval for the requested tool
    // And the approval channel will raise an error instead of deciding
    const throwingChannel: ChannelAdapter = {
      postApprovalRequest: (req) => Promise.resolve({ messageId: req.messageId }),
      awaitDecision: () => Promise.reject(new Error("approval timed out for nonce n1")),
      projectEvent: () => Promise.resolve(true),
    };
    const h = makeHarness(
      [{ id: "req-write", effect: "require", tool: "Write" }],
      {},
      throwingChannel,
    );
    try {
      // When the agent requests that tool
      const result = await h.daemon.runScripted(
        new ScriptedSprite([{ tool: "Write", args: { path: "/tmp/x", content: "y" } }]),
        { sessionId: "j1-s5" },
      );
      // Then the approval request is denied
      expect(result.outcomes[0]!.approved).toBe(false);
      // And the tool is not executed
      expect(result.outcomes[0]!.executed).toBe(false);
      // And the journal records the denial reason
      const events = readEvents(h.journalPath);
      const denied = events.find((e) => e.kind === "approval.denied");
      expect(denied).toBeDefined();
      expect(String(denied!.payload.reason)).toContain("no decision");
    } finally {
      h.cleanup();
    }
  });

  // Scenario: Sessions are listed from the journal (INV-6)
  test("Scenario: Sessions are listed from the journal", async () => {
    // Given the policy allows the requested tool
    // And a session has been run through the daemon
    const h = makeHarness([{ id: "allow-read", effect: "allow", tool: "Read" }]);
    try {
      await h.daemon.runScripted(
        new ScriptedSprite([{ tool: "Read", args: { path: "/README.md" } }]),
        { sessionId: "j1-s6" },
      );
      // When the operator lists sessions (using the same journal path via AGP_HOME)
      const lines: string[] = [];
      const env: Record<string, string | undefined> = { AGP_HOME: h.dir };

      // Write the journal to the canonical path so sessionsCommand can find it
      // sessionsCommand derives journal path from resolvePaths(env).journal
      // The harness writes to h.journalPath — verify they align
      const paths = resolvePaths(env);
      // The harness journal path is h.dir/audit.log; sessionsCommand expects
      // the canonical path from resolvePaths. They match only if we use dir.
      // Rebuild: sessionsCommand with the raw journal path via a custom env
      // that points AGP_HOME to the dir containing the journal.
      const code = sessionsCommand({ AGP_HOME: h.dir }, (l) => lines.push(l));
      const out = lines.join("\n");

      // Then at least one session entry is returned
      expect(code).toBe(0);
      // And each entry includes a session id and start time
      expect(out).toContain("session(s)");
      expect(out).toMatch(/j1-s6\s+started=\S+\s+calls=\d+/);
    } finally {
      h.cleanup();
    }
  });

  // Scenario: Live claude binary session is governed end-to-end (@gated)
  test.skip(
    "Scenario: Live claude binary session is governed end-to-end — gated (AGP_CLAUDE_LIVE)",
    // This scenario requires the real claude binary and is off-CI by design.
    // Tracked by bead agp-3g0 (live dogfood/UAT). Enable with AGP_CLAUDE_LIVE=1.
    () => {},
  );
});
