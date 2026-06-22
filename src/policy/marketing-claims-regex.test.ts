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
  // agp-g68: the `non.?repudia[bt]` stem now covers BOTH spellings (hyphenated or
  // not) and BOTH word endings (-iable / -iation), closing the gap the old
  // `nonrepudiat` stem left.
  for (const banned of [
    "tamper-evident",
    "tamper proof",
    "nonrepudiable",
    "non-repudiable",
    "nonrepudiation",
    "non-repudiation",
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
