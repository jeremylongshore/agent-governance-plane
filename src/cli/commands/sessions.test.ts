import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionsCommand } from "./sessions.ts";
import { resolvePaths } from "../../config.ts";
import { Journal } from "../../journal/journal.ts";
import { generateSigningKeyPem, loadPrivateKey } from "../../runtime/crypto.ts";

function homeEnv(): { env: Record<string, string | undefined>; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "agp-sessions-"));
  return { env: { AGP_HOME: dir }, dir };
}

function journalFor(env: Record<string, string | undefined>): Journal {
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  return new Journal(resolvePaths(env).journal, priv, () => "2026-06-03T00:00:00.000Z");
}

test("with no journal yet, reports nothing to list and exits 0", () => {
  const { env, dir } = homeEnv();
  const lines: string[] = [];
  const code = sessionsCommand(env, (l) => lines.push(l));
  expect(code).toBe(0);
  expect(lines.join("\n")).toContain("no journal yet");
  rmSync(dir, { recursive: true, force: true });
});

test("lists each recorded session with its start time and call count", () => {
  const { env, dir } = homeEnv();
  const j = journalFor(env);
  j.append({ kind: "session.started", actor: "session_owner", payload: { sessionId: "s1", intendant: { name: "scripted" } } });
  j.append({ kind: "session.ended", actor: "session_owner", payload: { sessionId: "s1", calls: 3 } });
  j.append({ kind: "session.started", actor: "session_owner", payload: { sessionId: "s2", intendant: { name: "claude-code" } } });
  j.append({ kind: "session.ended", actor: "session_owner", payload: { sessionId: "s2", calls: 0 } });

  const lines: string[] = [];
  const code = sessionsCommand(env, (l) => lines.push(l));
  const out = lines.join("\n");

  expect(code).toBe(0);
  expect(out).toContain("2 session(s)");
  expect(out).toMatch(/s1\s+started=2026-06-03T00:00:00\.000Z\s+calls=3/);
  expect(out).toMatch(/s2\s+started=.*\s+calls=0/);
  rmSync(dir, { recursive: true, force: true });
});

test("an in-flight session (started, not ended) shows calls unknown", () => {
  const { env, dir } = homeEnv();
  const j = journalFor(env);
  j.append({ kind: "session.started", actor: "session_owner", payload: { sessionId: "live", intendant: { name: "claude-code" } } });

  const lines: string[] = [];
  sessionsCommand(env, (l) => lines.push(l));
  const out = lines.join("\n");
  expect(out).toContain("1 session(s)");
  expect(out).toMatch(/live\s+started=.*\s+calls=\?/);
  rmSync(dir, { recursive: true, force: true });
});

test("a journal with no session events reports none recorded", () => {
  const { env, dir } = homeEnv();
  const j = journalFor(env);
  // a non-session event only — should not be counted as a session
  j.append({ kind: "tool_call.deny", actor: "claude_process", payload: { tool: "Bash" } });

  const lines: string[] = [];
  const code = sessionsCommand(env, (l) => lines.push(l));
  expect(code).toBe(0);
  expect(lines.join("\n")).toContain("no sessions recorded");
  rmSync(dir, { recursive: true, force: true });
});
