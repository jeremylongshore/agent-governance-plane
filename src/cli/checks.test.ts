import { test, expect } from "bun:test";
import { runDoctor, type DoctorProbe } from "./checks.ts";

const allOk: DoctorProbe = {
  docker: () => ({ ok: true, detail: "docker ok" }),
  slack: () => ({ ok: true, detail: "slack ok" }),
  signing: () => ({ ok: true, detail: "signing ok" }),
  policy: () => ({ ok: true, detail: "policy ok" }),
  sandbox: () => ({ ok: true, detail: "sandbox ok" }),
};

test("runDoctor passes only when every check passes (happy path)", () => {
  const report = runDoctor(allOk);
  expect(report.ok).toBe(true);
  expect(report.results.map((r) => r.name)).toEqual(["docker", "slack", "signing", "policy", "sandbox"]);
  expect(report.results.every((r) => r.status === "ok")).toBe(true);
});

test("runDoctor includes a sandbox check that fails closed", () => {
  const report = runDoctor({ ...allOk, sandbox: () => ({ ok: false, detail: "isolation unverified" }) });
  expect(report.ok).toBe(false);
  const sandbox = report.results.find((r) => r.name === "sandbox");
  expect(sandbox?.status).toBe("fail");
  expect(sandbox?.detail).toBe("isolation unverified");
});

test("runDoctor fails closed when a single check fails (failure path)", () => {
  const report = runDoctor({ ...allOk, docker: () => ({ ok: false, detail: "no docker daemon" }) });
  expect(report.ok).toBe(false);
  const docker = report.results.find((r) => r.name === "docker");
  expect(docker?.status).toBe("fail");
  expect(docker?.detail).toBe("no docker daemon");
  // the other three still report ok — failure is isolated, not contagious
  expect(report.results.filter((r) => r.status === "ok").map((r) => r.name)).toEqual([
    "slack",
    "signing",
    "policy",
    "sandbox",
  ]);
});

test("runDoctor reports every failure, not just the first", () => {
  const report = runDoctor({
    docker: () => ({ ok: false, detail: "a" }),
    slack: () => ({ ok: true, detail: "b" }),
    signing: () => ({ ok: false, detail: "c" }),
    policy: () => ({ ok: false, detail: "d" }),
    sandbox: () => ({ ok: true, detail: "e" }),
  });
  expect(report.ok).toBe(false);
  expect(report.results.filter((r) => r.status === "fail").map((r) => r.name)).toEqual([
    "docker",
    "signing",
    "policy",
  ]);
});
