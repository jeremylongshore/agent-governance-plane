import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsDoctorProbe } from "./probe.ts";
import { runDoctor } from "./checks.ts";
import { doctorCommand } from "./commands/doctor.ts";

const dockerPresent = Bun.which("docker") !== null;

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

// Gated: via the REAL FsDoctorProbe, runDoctor invokes sandbox() which spawns a
// throwaway container + runs the egress preflight — real Docker, non-deterministic
// in CI. The deterministic wiring ("runDoctor surfaces a sandbox check") is covered
// by checks.test.ts with a fake probe; this exercises the real path under the same
// AGP_DOCKER_E2E gate as the other real-Docker tests below.
test.skipIf(process.env.AGP_DOCKER_E2E !== "1")(
  "runDoctor surfaces a sandbox check via the real FsDoctorProbe",
  () => {
    const home = tempHome();
    const report = runDoctor(new FsDoctorProbe({ AGP_HOME: home }));
    expect(report.results.map((r) => r.name)).toContain("sandbox");
    rmSync(home, { recursive: true, force: true });
  },
);

// When docker is unavailable, sandbox() must fail closed (skipped, not ok).
// Skip when docker IS present (the live verdict is exercised under AGP_DOCKER_E2E).
test.skipIf(dockerPresent)("sandbox() fails closed when docker is unavailable", () => {
  const home = tempHome();
  const res = new FsDoctorProbe({ AGP_HOME: home }).sandbox();
  expect(res.ok).toBe(false);
  expect(res.detail).toContain("docker unavailable");
  rmSync(home, { recursive: true, force: true });
});

// Real docker: a throwaway --network none container must verify as isolated. Gated.
test.skipIf(process.env.AGP_DOCKER_E2E !== "1")("sandbox() verifies isolation against real docker", () => {
  const home = tempHome();
  const res = new FsDoctorProbe({ AGP_HOME: home }).sandbox();
  expect(res.ok).toBe(true);
  expect(res.detail).toContain("isolation verified");
  rmSync(home, { recursive: true, force: true });
});

test("doctorCommand returns non-zero on an unconfigured home (fail-closed end to end)", () => {
  const home = tempHome();
  const lines: string[] = [];
  // Skip the sandbox network probe: this is an end-to-end fail-closed test, not a
  // Docker test, and the real probe spawns a container (~6-9s) that blows the test
  // timeout in CI. The real-Docker path is covered by the AGP_DOCKER_E2E tests above.
  const code = doctorCommand({ AGP_HOME: home, AGP_SANDBOX_SKIP_NETCHECK: "1" }, (l) => lines.push(l));
  expect(code).toBe(1);
  expect(lines.some((l) => l.includes("✗"))).toBe(true);
  rmSync(home, { recursive: true, force: true });
});
