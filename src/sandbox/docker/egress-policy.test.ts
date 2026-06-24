import { test, expect } from "bun:test";
import { parseEgressMode, parseModelAllowlist, resolveEgressPolicy } from "./egress-policy.ts";

test("parseEgressMode: unset/empty ⇒ undefined (operator has not opted in)", () => {
  expect(parseEgressMode(undefined)).toBeUndefined();
  expect(parseEgressMode("")).toBeUndefined();
  expect(parseEgressMode("   ")).toBeUndefined();
});

test("parseEgressMode: recognizes none/full/allowlist, case-insensitive", () => {
  expect(parseEgressMode("none")).toBe("none");
  expect(parseEgressMode("FULL")).toBe("full");
  expect(parseEgressMode(" allowlist ")).toBe("allowlist");
});

test("parseEgressMode: unknown value throws (fail closed)", () => {
  expect(() => parseEgressMode("open")).toThrow("invalid AGP_SANDBOX_EGRESS");
});

test("parseModelAllowlist: splits on comma/whitespace, trims, drops empties", () => {
  expect(parseModelAllowlist("api.anthropic.test, api.openai.test")).toEqual(["api.anthropic.test", "api.openai.test"]);
  expect(parseModelAllowlist("a.test\n b.test")).toEqual(["a.test", "b.test"]);
  expect(parseModelAllowlist(undefined)).toEqual([]);
  expect(parseModelAllowlist("")).toEqual([]);
});

test("parseModelAllowlist: rejects a host with a scheme, port, or path (fail closed)", () => {
  expect(() => parseModelAllowlist("https://api.test")).toThrow("invalid egress allowlist host");
  expect(() => parseModelAllowlist("api.test:443")).toThrow("invalid egress allowlist host");
  expect(() => parseModelAllowlist("api.test/v1")).toThrow("invalid egress allowlist host");
  expect(() => parseModelAllowlist("-bad.test")).toThrow("invalid egress allowlist host");
});

test("parseModelAllowlist: rejects a bare IPv4 address (049 §1: allowlist by HOST, not IP)", () => {
  expect(() => parseModelAllowlist("1.2.3.4")).toThrow("invalid egress allowlist host");
  expect(() => parseModelAllowlist("192.168.1.1")).toThrow("invalid egress allowlist host");
  // A hostname that merely contains digits is still fine.
  expect(parseModelAllowlist("api2.model.test")).toEqual(["api2.model.test"]);
});

test("resolveEgressPolicy: absent switch ⇒ undefined (legacy networkEnabled behavior preserved)", () => {
  expect(resolveEgressPolicy({})).toBeUndefined();
});

test("resolveEgressPolicy: none/full carry an empty allowlist", () => {
  expect(resolveEgressPolicy({ AGP_SANDBOX_EGRESS: "none" })).toEqual({ mode: "none", allowlist: [] });
  expect(resolveEgressPolicy({ AGP_SANDBOX_EGRESS: "full" })).toEqual({ mode: "full", allowlist: [] });
});

test("resolveEgressPolicy: allowlist mode parses its host list", () => {
  expect(
    resolveEgressPolicy({ AGP_SANDBOX_EGRESS: "allowlist", AGP_SANDBOX_EGRESS_ALLOWLIST: "api.anthropic.test" }),
  ).toEqual({ mode: "allowlist", allowlist: ["api.anthropic.test"] });
});

test("resolveEgressPolicy: allowlist mode with NO hosts throws (fail closed)", () => {
  expect(() => resolveEgressPolicy({ AGP_SANDBOX_EGRESS: "allowlist" })).toThrow("requires AGP_SANDBOX_EGRESS_ALLOWLIST");
  expect(() => resolveEgressPolicy({ AGP_SANDBOX_EGRESS: "allowlist", AGP_SANDBOX_EGRESS_ALLOWLIST: "  " })).toThrow(
    "requires AGP_SANDBOX_EGRESS_ALLOWLIST",
  );
});

test("resolveEgressPolicy: invalid mode propagates the fail-closed throw", () => {
  expect(() => resolveEgressPolicy({ AGP_SANDBOX_EGRESS: "garbage" })).toThrow("invalid AGP_SANDBOX_EGRESS");
});
