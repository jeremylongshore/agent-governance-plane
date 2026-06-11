import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EnvSecretVault,
  type SecretVault,
  findPlaceholders,
  redactSecrets,
  resolvePlaceholders,
  resolvedSecretValues,
} from "./credentials.ts";
import { Daemon } from "../daemon/daemon.ts";
import { Journal, readEvents } from "../journal/journal.ts";
import { PolicyEngine } from "../policy/engine.ts";
import { ConsoleChannel } from "../runtime/channel.ts";
import { ScriptedSprite } from "../runtime/sprite.ts";
import { generateSigningKeyPem, loadPrivateKey } from "../runtime/crypto.ts";
import type {
  ExecResult,
  IsolationGuarantees,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "../contracts/sandbox-provider.ts";

class FakeVault implements SecretVault {
  constructor(private readonly map: Record<string, string>) {}
  get(name: string): string | undefined {
    return this.map[name];
  }
}

const VAULT = new FakeVault({ GITHUB_TOKEN: "ghp_supersecret", DB_PASS: "hunter2" });

// --- resolvePlaceholders -----------------------------------------------------

test("resolvePlaceholders swaps a single placeholder", () => {
  expect(resolvePlaceholders("Bearer {{secret:GITHUB_TOKEN}}", VAULT)).toBe("Bearer ghp_supersecret");
});

test("resolvePlaceholders swaps nested object + array placeholders", () => {
  const input = {
    header: "token={{secret:GITHUB_TOKEN}}",
    args: ["--pass", "{{secret:DB_PASS}}"],
    nested: { deep: { val: "{{secret:GITHUB_TOKEN}}" } },
    untouched: 42,
  };
  expect(resolvePlaceholders(input, VAULT)).toEqual({
    header: "token=ghp_supersecret",
    args: ["--pass", "hunter2"],
    nested: { deep: { val: "ghp_supersecret" } },
    untouched: 42,
  });
});

test("resolvePlaceholders FAILS CLOSED on a referenced-but-absent secret", () => {
  expect(() => resolvePlaceholders("{{secret:MISSING}}", VAULT)).toThrow("unresolved secret placeholder: MISSING");
  // It must NOT leave the literal placeholder or blank it.
  expect(() => resolvePlaceholders({ a: ["{{secret:MISSING}}"] }, VAULT)).toThrow("unresolved secret placeholder");
});

test("resolvePlaceholders leaves non-placeholder values untouched", () => {
  expect(resolvePlaceholders("plain", VAULT)).toBe("plain");
  expect(resolvePlaceholders(null, VAULT)).toBe(null);
  expect(resolvePlaceholders(7, VAULT)).toBe(7);
});

// --- findPlaceholders --------------------------------------------------------

test("findPlaceholders returns deduped NAMES only", () => {
  const input = {
    a: "{{secret:GITHUB_TOKEN}}",
    b: ["{{secret:DB_PASS}}", "{{secret:GITHUB_TOKEN}}"],
    c: "no secret here",
  };
  expect(findPlaceholders(input).sort()).toEqual(["DB_PASS", "GITHUB_TOKEN"]);
});

test("findPlaceholders returns empty for placeholder-free values", () => {
  expect(findPlaceholders({ a: "x", b: [1, 2, null] })).toEqual([]);
});

// --- redactSecrets -----------------------------------------------------------

test("redactSecrets masks a secret value in output, leaves unrelated text intact", () => {
  const out = "leaked ghp_supersecret here; harmless text";
  expect(redactSecrets(out, ["ghp_supersecret"])).toBe("leaked *** here; harmless text");
});

test("redactSecrets walks nested structures and ignores empty secret lists", () => {
  expect(redactSecrets({ a: ["hunter2 tail"] }, ["hunter2"])).toEqual({ a: ["*** tail"] });
  expect(redactSecrets("nothing", [])).toBe("nothing");
});

test("resolvedSecretValues returns distinct held values referenced by placeholders", () => {
  const input = ["{{secret:GITHUB_TOKEN}}", "{{secret:DB_PASS}}", "{{secret:MISSING}}"];
  expect(resolvedSecretValues(input, VAULT).sort()).toEqual(["ghp_supersecret", "hunter2"]);
});

// --- EnvSecretVault ----------------------------------------------------------

test("EnvSecretVault reads AGP_SECRET_* from an injected env map", () => {
  const vault = new EnvSecretVault({ AGP_SECRET_GITHUB_TOKEN: "ghp_env", OTHER: "ignored" });
  expect(vault.get("GITHUB_TOKEN")).toBe("ghp_env");
  expect(vault.get("MISSING")).toBeUndefined();
  expect(vault.get("OTHER")).toBeUndefined(); // not under the prefix
});

// --- Boundary proof: no raw secret crosses the sandbox boundary --------------

// A sandbox that records every argv it spawns AND execs, and echoes the resolved
// command back as stdout (the worst case: a tool that prints its own args).
class RecordingBoundarySandbox implements SandboxProvider {
  readonly spawnArgs: SandboxSpec[] = [];
  readonly execArgs: ReadonlyArray<readonly string[]>[] = [];
  isolation(): IsolationGuarantees {
    return { kind: "recording", boundary: "test", vmGrade: false };
  }
  spawn(spec: SandboxSpec): Promise<SandboxHandle> {
    this.spawnArgs.push(spec);
    return Promise.resolve({ id: `rec-${spec.sessionId}`, sessionId: spec.sessionId });
  }
  exec(_handle: SandboxHandle, command: readonly string[]): Promise<ExecResult> {
    this.execArgs.push([command]);
    // Echo the command back — simulates a tool leaking its own args to stdout.
    return Promise.resolve({ exitCode: 0, stdout: `ran: ${command.join(" ")}`, stderr: "" });
  }
  teardown(): Promise<void> {
    return Promise.resolve();
  }
}

test("BOUNDARY: the raw secret appears ONLY in the exec argv, never in spawn/journal/result", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-cred-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-06-02T00:00:00.000Z");
  const sandbox = new RecordingBoundarySandbox();

  const sprite = new ScriptedSprite([
    { tool: "Bash", args: { command: "curl -H 'Authorization: Bearer {{secret:GITHUB_TOKEN}}' https://api" } },
  ]);

  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "allow-bash", effect: "allow", tool: "Bash" }]),
    journal,
    sandbox,
    channel: new ConsoleChannel({}, () => {}),
    vault: VAULT,
  });

  const res = await daemon.runScripted(sprite, { sessionId: "s1" });
  expect(res.outcomes[0]!.executed).toBe(true);

  const SECRET = "ghp_supersecret";

  // (a) The resolved secret IS in the exec argv (and nowhere else).
  const execJoined = sandbox.execArgs.flat(2).join(" ");
  expect(execJoined).toContain(SECRET);
  expect(execJoined).not.toContain("{{secret:");

  // (b) NEVER in the spawn spec.
  expect(JSON.stringify(sandbox.spawnArgs)).not.toContain(SECRET);

  // (c) NEVER in any journal payload — but the secret NAME is recorded.
  const journalText = readFileSync(path, "utf8");
  expect(journalText).not.toContain(SECRET);
  const executed = readEvents(path).find((e) => e.kind === "tool_call.executed");
  expect(executed?.payload.secretsUsed).toEqual(["GITHUB_TOKEN"]);

  // (d) NEVER in the delivered ToolCallResult — even though the tool echoed it,
  // redaction masked it.
  expect(JSON.stringify(sprite.delivered)).not.toContain(SECRET);
  const result = sprite.delivered.find((m) => m.kind === "tool_call_result");
  expect(String((result as { output?: unknown })?.output)).toContain("***");

  rmSync(dir, { recursive: true, force: true });
});

test("BOUNDARY: a placeholder with NO vault dep fails closed (never reaches exec verbatim)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-cred-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-06-02T00:00:00.000Z");
  const sandbox = new RecordingBoundarySandbox();
  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "allow-bash", effect: "allow", tool: "Bash" }]),
    journal,
    sandbox,
    channel: new ConsoleChannel({}, () => {}),
    // no vault
  });
  await expect(
    daemon.runScripted(new ScriptedSprite([{ tool: "Bash", args: { command: "echo {{secret:GITHUB_TOKEN}}" } }]), {
      sessionId: "s1",
    }),
  ).rejects.toThrow("unresolved secret placeholder");
  // The literal placeholder was never handed to exec.
  expect(sandbox.execArgs).toHaveLength(0);
  rmSync(dir, { recursive: true, force: true });
});

test("a placeholder-free call still works unchanged when a vault is present", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-cred-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-06-02T00:00:00.000Z");
  const sandbox = new RecordingBoundarySandbox();
  const daemon = new Daemon({
    policy: new PolicyEngine([{ id: "allow-read", effect: "allow", tool: "Read" }]),
    journal,
    sandbox,
    channel: new ConsoleChannel({}, () => {}),
    vault: VAULT,
  });
  const res = await daemon.runScripted(new ScriptedSprite([{ tool: "Read", args: { path: "/x" } }]), {
    sessionId: "s1",
  });
  expect(res.outcomes[0]!.executed).toBe(true);
  const executed = readEvents(path).find((e) => e.kind === "tool_call.executed");
  // No secretsUsed key when no placeholders are present.
  expect(executed?.payload.secretsUsed).toBeUndefined();
  rmSync(dir, { recursive: true, force: true });
});
