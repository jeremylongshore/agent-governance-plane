// `agp watch` command tests — reference-mode paths only (hermetic; the live
// Docker/Slack paths stay behind AGP_DOCKER_E2E / AGP_SLACK_LIVE like `agp run`).

import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initCommand } from "./init.ts";
import { keygenCommand } from "./keygen.ts";
import { watchCommand } from "./watch.ts";
import { readEvents } from "../../journal/journal.ts";
import { resolvePaths } from "../../config.ts";

const POLICY = {
  rules: [
    { id: "watcher-gh-read", effect: "allow", tool: "gh_read", actor: "claude_process" },
    { id: "watcher-gh-issue-create", effect: "require", tool: "gh_issue_create", actor: "claude_process" },
  ],
};

function home(): { env: Record<string, string | undefined>; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "agp-watch-"));
  return { env: { AGP_HOME: dir }, dir };
}

/** A provisioned home (init + keygen + watcher policy) and a committed spec. */
function provisioned(specOverrides: Record<string, unknown> = {}) {
  const { env, dir } = home();
  initCommand(env);
  keygenCommand(env);
  const paths = resolvePaths(env);
  writeFileSync(paths.policy, JSON.stringify(POLICY));
  const specPath = join(dir, "watcher.spec.json");
  writeFileSync(
    specPath,
    JSON.stringify({
      id: "sdk-watcher",
      enabled: true,
      repo: "acme/sdk",
      watch: "releases",
      issueRepo: "acme/watch-inbox",
      humanCommit: { committedBy: "jeremy", committedAt: "2026-07-10T00:00:00.000Z", method: "manual" },
      ...specOverrides,
    }),
  );
  return { env, dir, specPath, paths };
}

test("run fails closed: missing --spec, missing spec file, disabled spec, missing key", async () => {
  const lines: string[] = [];
  const out = (l: string) => lines.push(l);

  expect(await watchCommand(["run"], home().env, out)).toBe(1);
  expect(lines.join("\n")).toContain("--spec <path> is required");

  expect(await watchCommand(["run", "--spec", "/nope.json"], home().env, out)).toBe(1);

  const disabled = provisioned({ enabled: false });
  expect(await watchCommand(["run", "--spec", disabled.specPath], disabled.env, out)).toBe(1);
  expect(lines.join("\n")).toContain("enabled:false");
  rmSync(disabled.dir, { recursive: true, force: true });

  const { env, dir, specPath } = provisioned();
  rmSync(resolvePaths(env).signingKey); // provisioned, then key removed
  expect(await watchCommand(["run", "--spec", specPath], env, out)).toBe(1);
  expect(lines.join("\n")).toContain("signing key missing");
  rmSync(dir, { recursive: true, force: true });
});

test("a draft spec (no humanCommit) refuses — the human commit gate at the CLI boundary", async () => {
  const { env, dir, specPath } = provisioned();
  const raw = JSON.parse(readFileSync(specPath, "utf8"));
  delete raw.humanCommit;
  writeFileSync(specPath, JSON.stringify(raw));
  const lines: string[] = [];
  expect(await watchCommand(["run", "--spec", specPath], env, (l) => lines.push(l))).toBe(1);
  expect(lines.join("\n")).toContain("(fail-closed)");
  rmSync(dir, { recursive: true, force: true });
});

test("reference run records an HONEST failure (recording sandbox reads nothing) with the full journal bracket", async () => {
  const { env, dir, specPath, paths } = provisioned();
  const lines: string[] = [];
  const code = await watchCommand(["run", "--spec", specPath], env, (l) => lines.push(l));
  expect(code).toBe(2); // ran, read unparseable → failure, fail-closed

  const events = readEvents(paths.journal);
  const kinds = events.map((e) => e.kind);
  expect(kinds).toContain("trigger.fired");
  expect(kinds).toContain("session.started");
  expect(kinds).toContain("tool_call.allow"); // the gh_read verdict
  expect(kinds).toContain("session.ended");
  expect(kinds).toContain("trigger.settled");

  // Cross-chain causal pointer: fired + settled share the correlationId, and
  // settled records the post-run knowledge tip.
  const fired = events.find((e) => e.kind === "trigger.fired")!;
  const settled = events.find((e) => e.kind === "trigger.settled")!;
  expect(settled.payload.correlationId).toBe(fired.payload.correlationId);
  expect(fired.payload.knowledgeTipHash).toBeNull(); // knew nothing before run 1
  expect(typeof settled.payload.knowledgeTipHash).toBe("string"); // knows the run now
  expect(settled.payload.ok).toBe(false);

  // The state log recorded the failed run.
  const state = readFileSync(join(dir, "watch", "sdk-watcher.state.jsonl"), "utf8");
  expect(state).toContain('"ok":false');
  rmSync(dir, { recursive: true, force: true });
});

test("restart-intensity bound: after maxConsecutiveFailures the runner REFUSES until a human enables", async () => {
  const { env, dir, specPath } = provisioned({ maxConsecutiveFailures: 2 });
  const out = () => {};
  expect(await watchCommand(["run", "--spec", specPath], env, out)).toBe(2);
  expect(await watchCommand(["run", "--spec", specPath], env, out)).toBe(2);
  // Bound reached: the third run refuses before doing anything.
  const lines: string[] = [];
  expect(await watchCommand(["run", "--spec", specPath], env, (l) => lines.push(l))).toBe(3);
  expect(lines.join("\n")).toContain("REFUSING");

  // Human re-commit resets the streak; the next run runs again (and fails honestly).
  expect(await watchCommand(["enable", "--spec", specPath], env, out)).toBe(0);
  expect(await watchCommand(["run", "--spec", specPath], env, out)).toBe(2);
  rmSync(dir, { recursive: true, force: true });
});

test("status: reports the dead-man's-switch — never-run cadence-bound is STALE, fresh run is ok", async () => {
  const bound = provisioned({ livenessTimeoutMs: 60_000 });
  const lines: string[] = [];
  expect(await watchCommand(["status", "--spec", bound.specPath], bound.env, (l) => lines.push(l))).toBe(1);
  expect(lines.join("\n")).toContain("STALE");

  await watchCommand(["run", "--spec", bound.specPath], bound.env, () => {});
  const after: string[] = [];
  expect(await watchCommand(["status", "--spec", bound.specPath], bound.env, (l) => after.push(l))).toBe(0);
  expect(after.join("\n")).toContain("liveness:             ok");
  expect(after.join("\n")).toContain("knowledge chain:      intact");
  rmSync(bound.dir, { recursive: true, force: true });

  const unbound = provisioned(); // livenessTimeoutMs null → not cadence-watched
  expect(await watchCommand(["status", "--spec", unbound.specPath], unbound.env, () => {})).toBe(0);
  rmSync(unbound.dir, { recursive: true, force: true });
});

test("status detects a tampered knowledge chain (exit 1, BROKEN)", async () => {
  const { env, dir, specPath } = provisioned();
  await watchCommand(["run", "--spec", specPath], env, () => {});
  const statePath = join(dir, "watch", "sdk-watcher.state.jsonl");
  const entry = JSON.parse(readFileSync(statePath, "utf8").trim());
  entry.payload.ok = true; // rewrite history: the failure never happened
  writeFileSync(statePath, JSON.stringify(entry) + "\n");
  const lines: string[] = [];
  expect(await watchCommand(["status", "--spec", specPath], env, (l) => lines.push(l))).toBe(1);
  expect(lines.join("\n")).toContain("BROKEN");
  rmSync(dir, { recursive: true, force: true });
});

test("unknown subcommand and slack-without-live fail closed", async () => {
  const lines: string[] = [];
  expect(await watchCommand(["prowl"], home().env, (l) => lines.push(l))).toBe(1);
  expect(lines.join("\n")).toContain("unknown subcommand");

  const { env, dir, specPath } = provisioned();
  const slackEnv = {
    ...env,
    AGP_CHANNEL: "slack",
    AGP_SLACK_BOT_TOKEN: "xoxb-test",
    AGP_SLACK_APP_TOKEN: "xapp-test",
    AGP_SLACK_CHANNEL: "C123",
  };
  const slackLines: string[] = [];
  expect(await watchCommand(["run", "--spec", specPath], slackEnv, (l) => slackLines.push(l))).toBe(1);
  expect(slackLines.join("\n")).toContain("AGP_SLACK_LIVE");
  rmSync(dir, { recursive: true, force: true });
});
