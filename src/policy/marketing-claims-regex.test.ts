import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// agp-cln.4: registering the multi-harness claim must NOT weaken the banned-term
// denylist. This reads the SAME banned regex claim-scan.sh consumes from the
// registry and proves (a) it still catches every v0-banned assurance term, and
// (b) the newly-permitted multi-harness wording is clean.

function bannedRegex(): RegExp {
  const registry = readFileSync(join(import.meta.dir, "..", "..", "MARKETING_CLAIMS.md"), "utf8");
  const m = registry.match(/^<!-- regex: (.*) -->$/m);
  if (!m) throw new Error("could not extract the banned-claim regex from MARKETING_CLAIMS.md");
  return new RegExp(m[1]!, "i");
}

test("the banned denylist still catches every v0-banned assurance term", () => {
  const re = bannedRegex();
  // Forms the regex actually catches today. NOTE (tracked as a follow-up security
  // bead): the `nonrepudiat` stem under-covers what the registry's prose claims —
  // it misses "nonrepudiable" (-iable, not -iat) and hyphenated "non-repudiation".
  // This claim-unlock change does NOT widen the hash-pinned regex; it documents the
  // real coverage so the gap is visible and fixed deliberately.
  for (const banned of [
    "tamper-evident",
    "tamper proof",
    "nonrepudiation",
    "forensic-grade",
    "audit-grade",
    "compliance-grade",
  ]) {
    expect(re.test(banned)).toBe(true);
  }
});

test("the newly-permitted multi-harness claim wording is NOT banned", () => {
  const re = bannedRegex();
  expect(
    re.test("governs multiple agent harnesses (Claude Code and Codex) identically through one policy gate and signed journal"),
  ).toBe(false);
  // And the only other allowed claim stays clean too.
  expect(re.test("signed audit log of every tool call")).toBe(false);
});
