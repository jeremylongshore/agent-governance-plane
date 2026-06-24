import { test, expect } from "bun:test";
import {
  type AllowlistVerdict,
  allowlistProbeArgv,
  classifyAllowlistProbe,
  DEFAULT_NON_MODEL_PROBE,
} from "./allowlist-preflight.ts";
import type { RunResult } from "./runner.ts";

const ok: RunResult = { exitCode: 0, stdout: "open", stderr: "" };
const refused: RunResult = { exitCode: 1, stdout: "", stderr: "nc: connection refused" };

function v(nonModel: RunResult, model: RunResult): AllowlistVerdict {
  return classifyAllowlistProbe(nonModel, model);
}

test("allowlistProbeArgv: minimal busybox nc connect probe, asserted verbatim", () => {
  expect(allowlistProbeArgv("api.example", "443")).toEqual(["nc", "-w", "3", "-z", "api.example", "443"]);
  // The default non-model target is a real, normally-reachable host (the breach signal).
  expect(allowlistProbeArgv(DEFAULT_NON_MODEL_PROBE.host, DEFAULT_NON_MODEL_PROBE.port)).toEqual([
    "nc",
    "-w",
    "3",
    "-z",
    "example.com",
    "443",
  ]);
});

test("enforced ONLY when non-model is blocked AND model is reachable", () => {
  const verdict = v(refused, ok);
  expect(verdict.enforced).toBe(true);
  expect(verdict.detail).toContain("enforced");
});

test("non-model reachable (exit 0) ⇒ NOT enforced (the silent-degrade breach)", () => {
  const verdict = v(ok, ok);
  expect(verdict.enforced).toBe(false);
  expect(verdict.detail).toContain("NOT enforced");
});

test("model unreachable ⇒ NOT enforced, with a clear harness-cannot-reach-model error", () => {
  const verdict = v(refused, { exitCode: 1, stdout: "", stderr: "no route to host" });
  expect(verdict.enforced).toBe(false);
  expect(verdict.detail).toContain("harness cannot reach the model");
});

test("model probe failure surfaces a reason even with empty stderr", () => {
  const verdict = v(refused, { exitCode: 7, stdout: "", stderr: "" });
  expect(verdict.enforced).toBe(false);
  expect(verdict.detail).toContain("exit 7");
});

test("non-model probe could not run (exit 127) ⇒ NOT enforced (cannot prove — fail closed)", () => {
  const verdict = v({ exitCode: 127, stdout: "", stderr: "nc: not found" }, ok);
  expect(verdict.enforced).toBe(false);
  expect(verdict.detail).toContain("cannot prove allowlist enforcement");
});

test("non-model unrecognized failure ⇒ NOT enforced (cannot prove it was an allowlist block)", () => {
  const verdict = v({ exitCode: 2, stdout: "", stderr: "some other weirdness" }, ok);
  expect(verdict.enforced).toBe(false);
  expect(verdict.detail).toContain("cannot prove enforcement");
});

test("recognized block phrasings (incl. tight proxy-deny) read as blocked", () => {
  for (const stderr of ["connection refused", "operation timed out", "bad address", "403 Forbidden", "proxy: denied"]) {
    expect(v({ exitCode: 1, stdout: "", stderr }, ok).enforced).toBe(true);
  }
  // Non-zero with empty stderr is treated as a block (nc -z is silent on refuse).
  expect(v({ exitCode: 1, stdout: "", stderr: "" }, ok).enforced).toBe(true);
});

test("a LOCAL 'nc: Permission denied' is ambiguous ⇒ NOT enforced (not a remote block — fail closed)", () => {
  // A container socket-permission failure must NOT be mistaken for an allowlist
  // block; egress reachability is unknown, so the verdict stays not-enforced.
  const verdict = v({ exitCode: 1, stdout: "", stderr: "nc: Permission denied" }, ok);
  expect(verdict.enforced).toBe(false);
  expect(verdict.detail).toContain("cannot prove enforcement");
});
