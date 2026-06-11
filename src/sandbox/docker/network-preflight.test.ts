import { test, expect } from "bun:test";
import { classifyEgressProbe, egressProbeArgv, verifyNetworkIsolation } from "./network-preflight.ts";
import type { DockerRunner, RunResult } from "./runner.ts";
import type { SandboxHandle } from "../../contracts/sandbox-provider.ts";

class FakeDockerRunner implements DockerRunner {
  readonly calls: string[][] = [];
  constructor(private readonly respond: (args: readonly string[]) => RunResult) {}
  run(args: readonly string[]): Promise<RunResult> {
    this.calls.push([...args]);
    return Promise.resolve(this.respond(args));
  }
}

const HANDLE: SandboxHandle = { id: "container-xyz", sessionId: "s1" };

test("classifyEgressProbe: a FAILED probe while isolation was requested ⇒ isolated", () => {
  const v = classifyEgressProbe({ exitCode: 1, stdout: "", stderr: "nc: connection refused" }, false);
  expect(v.isolated).toBe(true);
  expect(v.detail).toContain("isolation confirmed");
});

test("classifyEgressProbe: a SUCCEEDED probe (exit 0) ⇒ NOT isolated (silent-degrade breach)", () => {
  const v = classifyEgressProbe({ exitCode: 0, stdout: "open", stderr: "" }, false);
  expect(v.isolated).toBe(false);
  expect(v.detail).toContain("NOT enforced");
});

test("classifyEgressProbe: an ambiguous/unrecognized failure ⇒ NOT isolated (fail closed)", () => {
  const v = classifyEgressProbe({ exitCode: 2, stdout: "", stderr: "some other weirdness" }, false);
  expect(v.isolated).toBe(false);
  expect(v.detail).toContain("cannot prove isolation");
});

test("classifyEgressProbe: a missing nc binary (exit 127) ⇒ NOT isolated (fail closed)", () => {
  const v = classifyEgressProbe({ exitCode: 127, stdout: "", stderr: "nc: not found" }, false);
  expect(v.isolated).toBe(false);
  expect(v.detail).toContain("cannot prove isolation");
});

test("classifyEgressProbe: a timeout/DNS failure reads as isolated", () => {
  expect(classifyEgressProbe({ exitCode: 1, stdout: "", stderr: "operation timed out" }, false).isolated).toBe(true);
  expect(classifyEgressProbe({ exitCode: 1, stdout: "", stderr: "bad address" }, false).isolated).toBe(true);
  // Non-zero with empty stderr is treated as a network failure (nc -z is silent on refuse).
  expect(classifyEgressProbe({ exitCode: 1, stdout: "", stderr: "" }, false).isolated).toBe(true);
});

test("classifyEgressProbe: when network was explicitly enabled, isolation is not expected", () => {
  const v = classifyEgressProbe({ exitCode: 1, stdout: "", stderr: "connection refused" }, true);
  expect(v.isolated).toBe(false);
  expect(v.detail).toContain("network was explicitly enabled");
});

test("verifyNetworkIsolation issues the minimal busybox egress probe argv", async () => {
  const runner = new FakeDockerRunner(() => ({ exitCode: 1, stdout: "", stderr: "connection refused" }));
  const v = await verifyNetworkIsolation(runner, HANDLE, { networkRequested: false });
  expect(v.isolated).toBe(true);
  expect(runner.calls).toHaveLength(1);
  expect(runner.calls[0]).toEqual(["exec", "container-xyz", ...egressProbeArgv()]);
  // The probe is a busybox nc connect attempt with a short timeout.
  expect(egressProbeArgv()[0]).toBe("nc");
  expect(egressProbeArgv()).toContain("-z");
});

test("verifyNetworkIsolation reports NOT isolated when the probe connects (exit 0)", async () => {
  const runner = new FakeDockerRunner(() => ({ exitCode: 0, stdout: "", stderr: "" }));
  const v = await verifyNetworkIsolation(runner, HANDLE, { networkRequested: false });
  expect(v.isolated).toBe(false);
});
