import { test, expect } from "bun:test";
import { NoopVerifier } from "./noop-verifier.ts";
import type { VerifyResult } from "../contracts/verifier.ts";

// Exhaustiveness: a switch over the discriminated union must cover both arms;
// this won't typecheck if VerifyResult ever grows an unhandled shape.
function describe(r: VerifyResult): string {
  switch (r.ok) {
    case true:
      return `ok:${r.identity.uri ?? "null"}`;
    case false:
      return `fail:${r.reason}`;
  }
}

test("NoopVerifier trusts nothing — every artifact fails closed with unknown-key", async () => {
  const v = new NoopVerifier();
  expect(v.scheme).toBe("noop");
  const r = await v.verify({ name: "x", version: "1.0.0" }, "AAAA");
  expect(r.ok).toBe(false);
  expect(describe(r)).toBe("fail:unknown-key");
});

test("VerifyResult discriminated union is exhaustive over ok/fail", () => {
  expect(
    describe({ ok: true, identity: { name: "x", version: "1", uri: "agp-intendant:ed25519/x@1/abc" } }),
  ).toBe("ok:agp-intendant:ed25519/x@1/abc");
  expect(describe({ ok: false, reason: "bad-signature" })).toBe("fail:bad-signature");
});
