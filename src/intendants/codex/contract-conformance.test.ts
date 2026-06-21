import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Daemon, type RunnableIntendant } from "../../daemon/daemon.ts";
import { Journal, readEvents } from "../../journal/journal.ts";
import { verifyJournalFile } from "../../journal/verify.ts";
import { PolicyEngine, type PolicyRule } from "../../policy/engine.ts";
import { RecordingSandbox } from "../../runtime/sandbox.ts";
import { ConsoleChannel } from "../../runtime/channel.ts";
import { generateSigningKeyPem, loadPrivateKey, publicKeyFromPrivate } from "../../runtime/crypto.ts";
import { ClaudeCodeIntendant } from "../claude-code/claude-code-intendant.ts";
import { InMemoryClaudeProcess } from "../claude-code/claude-process.ts";
import { CodexIntendant } from "./codex-intendant.ts";
import { InMemoryCodexProcess } from "./codex-process.ts";

// The genericity proof (044-AT-ADR §2): the SAME policy + SAME logical script
// driven through the SAME daemon.runLive must produce identical governance for
// BOTH harnesses. If this passes for both, there is no "if codex" in the gate —
// the multi-harness claim (agp-cln.4) is honest.

type Script = ReadonlyArray<{ tool: string; args: Record<string, unknown> }>;

/** Each harness builds its own intendant over its own deterministic process,
 *  fed the identical script — the only difference is the adapter under test. */
const HARNESSES: Array<{ name: string; build: (s: Script) => RunnableIntendant }> = [
  { name: "claude-code", build: (s) => new ClaudeCodeIntendant(new InMemoryClaudeProcess(s)) },
  { name: "codex", build: (s) => new CodexIntendant(new InMemoryCodexProcess(s)) },
];

const POLICY: PolicyRule[] = [
  { id: "allow-read", effect: "allow", tool: "Read" },
  { id: "deny-bash", effect: "deny", tool: "Bash", reason: "no shell" },
  { id: "req-write", effect: "require", tool: "Write" },
];

const SCRIPT: Script = [
  { tool: "Read", args: { path: "/work/a.ts" } }, // allow
  { tool: "Bash", args: { command: "rm -rf /" } }, // deny
  { tool: "Write", args: { path: "/work/b.ts", content: "x" } }, // require -> approved
  { tool: "WebFetch", args: { url: "http://x" } }, // unmatched -> default deny
];

function run() {
  const dir = mkdtempSync(join(tmpdir(), "agp-conf-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const journal = new Journal(path, priv, () => "2026-06-21T00:00:00.000Z");
  const daemon = new Daemon({
    policy: new PolicyEngine(POLICY),
    journal,
    sandbox: new RecordingSandbox(),
    channel: new ConsoleChannel({ AGP_AUTO_APPROVE: "1" }, () => {}),
  });
  return { dir, path, daemon, pub: publicKeyFromPrivate(priv) };
}

test("both harnesses produce IDENTICAL governance under the same policy + script", async () => {
  const results = [];
  for (const h of HARNESSES) {
    const { dir, path, daemon, pub } = run();
    const res = await daemon.runLive(h.build(SCRIPT), { sessionId: "s1" });
    results.push({
      name: h.name,
      verdicts: res.outcomes.map((o) => o.verdict.decision),
      approvals: res.outcomes.map((o) => o.approved),
      // journal event kinds, minus the per-run session lifecycle bookends
      kinds: readEvents(path)
        .map((e) => e.kind)
        .filter((k) => k.startsWith("tool_call.") || k.startsWith("gate.") || k.startsWith("approval.")),
      verifies: verifyJournalFile(path, pub).ok,
    });
    rmSync(dir, { recursive: true, force: true });
  }

  const [claude, codex] = results;
  // Same verdict sequence, same approval sequence, same journal event kinds.
  expect(codex!.verdicts).toEqual(claude!.verdicts);
  expect(codex!.approvals).toEqual(claude!.approvals);
  expect(codex!.kinds).toEqual(claude!.kinds);
  // And the expected governance actually happened (not just "identically nothing").
  expect(claude!.verdicts).toEqual(["allow", "deny", "require", "deny"]);
  expect(claude!.kinds).toContain("gate.allow");
  expect(claude!.kinds).toContain("gate.deny");
  expect(claude!.kinds).toContain("approval.granted");
  expect(claude!.verifies && codex!.verifies).toBe(true);
});
