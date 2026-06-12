import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "./run.ts";
import { initCommand } from "./init.ts";
import { keygenCommand } from "./keygen.ts";
import { resolvePaths } from "../../config.ts";

function home(): { env: Record<string, string | undefined>; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "agp-run-"));
  return { env: { AGP_HOME: dir }, dir };
}

/** A fully-provisioned config home: init (config + policy + signing dir) + keygen. */
function provisioned(): { env: Record<string, string | undefined>; dir: string } {
  const { env, dir } = home();
  initCommand(env);
  keygenCommand(env);
  return { env, dir };
}

test("fails closed when the signing key is missing", async () => {
  const { env, dir } = home();
  initCommand(env); // policy exists, but no keygen → no signing key
  const lines: string[] = [];
  const code = await runCommand(env, (l) => lines.push(l));
  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("signing key missing");
  rmSync(dir, { recursive: true, force: true });
});

test("fails closed when the policy is missing", async () => {
  const { env, dir } = provisioned();
  unlinkSync(resolvePaths(env).policy); // remove policy after provisioning
  const lines: string[] = [];
  const code = await runCommand(env, (l) => lines.push(l));
  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("policy missing");
  rmSync(dir, { recursive: true, force: true });
});

test("reference mode runs the loop and writes a verifiable journal", async () => {
  const { env, dir } = provisioned();
  const lines: string[] = [];
  const code = await runCommand(env, (l) => lines.push(l));
  expect(code).toBe(0);
  const out = lines.join("\n");
  expect(out).toContain("tool call(s)");
  expect(out).toContain("journal:");
  rmSync(dir, { recursive: true, force: true });
});

test("AGP_SANDBOX=docker fails closed (no host fallback) without a pinned image or daemon", async () => {
  const { env, dir } = provisioned();
  const lines: string[] = [];
  const code = await runCommand({ ...env, AGP_SANDBOX: "docker" }, (l) => lines.push(l));
  expect(code).toBe(1);
  // Either Docker is absent (CI) or the image is unpinned — both fail closed.
  expect(lines.join("\n")).toMatch(/Docker is not available|requires AGP_SANDBOX_IMAGE/);
  rmSync(dir, { recursive: true, force: true });
});

test("AGP_CHANNEL=slack fails closed when Slack is not configured", async () => {
  const { env, dir } = provisioned();
  const lines: string[] = [];
  const code = await runCommand({ ...env, AGP_CHANNEL: "slack" }, (l) => lines.push(l));
  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("slack config missing");
  rmSync(dir, { recursive: true, force: true });
});

test("AGP_CHANNEL=slack fails closed when configured but AGP_SLACK_LIVE is not set", async () => {
  // The live Socket Mode receiver is the off-CI dogfood path (like AGP_DOCKER_E2E
  // / AGP_CLAUDE_LIVE); without AGP_SLACK_LIVE=1 we refuse to post a prompt that
  // nothing can answer. The live wiring itself is covered by the gated
  // slack-dialer test, not here (it would make a real network call).
  const { env, dir } = provisioned();
  const slackEnv = {
    ...env,
    AGP_CHANNEL: "slack",
    AGP_SLACK_BOT_TOKEN: "xoxb-test",
    AGP_SLACK_APP_TOKEN: "xapp-test",
    AGP_SLACK_CHANNEL: "C123",
  };
  const lines: string[] = [];
  const code = await runCommand(slackEnv, (l) => lines.push(l));
  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("AGP_SLACK_LIVE");
  rmSync(dir, { recursive: true, force: true });
});

test("the claude-code live flag fails closed without --task/--repo", async () => {
  // AGP_CLAUDE_LIVE=1 now wires the real spawn, but it must be given a task + repo;
  // missing either fails closed rather than spawning aimlessly. (The actual live
  // spawn is exercised off-CI — see the AGP_CLAUDE_LIVE dogfood test.)
  const { env, dir } = provisioned();
  const lines: string[] = [];
  const code = await runCommand({ ...env, AGP_CLAUDE_LIVE: "1" }, (l) => lines.push(l), { intendant: "claude-code" });
  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("requires --task");
  rmSync(dir, { recursive: true, force: true });
});
