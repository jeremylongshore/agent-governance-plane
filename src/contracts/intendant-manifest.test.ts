import { test, expect } from "bun:test";
import { IntendantManifest } from "./intendant-manifest.ts";

test("IntendantManifest parses a valid manifest", () => {
  expect(IntendantManifest.parse({ name: "claude-code", version: "1.0.0" })).toEqual({
    name: "claude-code",
    version: "1.0.0",
  });
});

test("IntendantManifest rejects empty name or version, and a missing field", () => {
  expect(() => IntendantManifest.parse({ name: "", version: "1.0.0" })).toThrow();
  expect(() => IntendantManifest.parse({ name: "x", version: "" })).toThrow();
  expect(() => IntendantManifest.parse({ name: "x" })).toThrow();
});
