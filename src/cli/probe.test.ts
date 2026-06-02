import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsDoctorProbe } from "./probe.ts";
import { doctorCommand } from "./commands/doctor.ts";

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "agp-probe-"));
}

test("signing() fails closed when the key is absent, passes once present", () => {
  const home = tempHome();
  const env = { AGP_HOME: home };
  expect(new FsDoctorProbe(env).signing().ok).toBe(false);

  mkdirSync(join(home, "signing"), { recursive: true });
  writeFileSync(join(home, "signing", "journal-ed25519.key"), "fake-key-bytes");
  expect(new FsDoctorProbe(env).signing().ok).toBe(true);

  rmSync(home, { recursive: true, force: true });
});

test("policy() rejects missing, non-JSON, and rules-less files (unsafe-config rejection)", () => {
  const home = tempHome();
  const env = { AGP_HOME: home };
  const policyPath = join(home, "policy.json");

  expect(new FsDoctorProbe(env).policy().ok).toBe(false); // missing

  writeFileSync(policyPath, "{ not valid json");
  expect(new FsDoctorProbe(env).policy().ok).toBe(false); // unparseable

  writeFileSync(policyPath, JSON.stringify(["not", "an", "object"]));
  expect(new FsDoctorProbe(env).policy().ok).toBe(false); // array, not object

  writeFileSync(policyPath, JSON.stringify({ notRules: 1 }));
  expect(new FsDoctorProbe(env).policy().ok).toBe(false); // missing required `rules`

  writeFileSync(policyPath, JSON.stringify({ rules: [] }));
  expect(new FsDoctorProbe(env).policy().ok).toBe(true); // valid

  rmSync(home, { recursive: true, force: true });
});

test("slack() requires all of bot token, app token, and channel", () => {
  const home = tempHome();
  expect(new FsDoctorProbe({ AGP_HOME: home }).slack().ok).toBe(false);

  const full = {
    AGP_HOME: home,
    AGP_SLACK_BOT_TOKEN: "xoxb-x",
    AGP_SLACK_APP_TOKEN: "xapp-x",
    AGP_SLACK_CHANNEL: "#agp",
  };
  expect(new FsDoctorProbe(full).slack().ok).toBe(true);

  const partial = { AGP_HOME: home, AGP_SLACK_BOT_TOKEN: "xoxb-x" };
  const res = new FsDoctorProbe(partial).slack();
  expect(res.ok).toBe(false);
  expect(res.detail).toContain("app token");
  expect(res.detail).toContain("channel");

  rmSync(home, { recursive: true, force: true });
});

test("doctorCommand returns non-zero on an unconfigured home (fail-closed end to end)", () => {
  const home = tempHome();
  const lines: string[] = [];
  const code = doctorCommand({ AGP_HOME: home }, (l) => lines.push(l));
  expect(code).toBe(1);
  expect(lines.some((l) => l.includes("✗"))).toBe(true);
  rmSync(home, { recursive: true, force: true });
});
