import { test, expect } from "bun:test";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initCommand } from "./commands/init.ts";

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "agp-init-"));
}

test("init creates the config + policy skeletons and the signing dir", () => {
  const home = tempHome();
  const res = initCommand({ AGP_HOME: home });

  expect(res.code).toBe(0);
  expect(res.created).toContain(join(home, "config.json"));
  expect(res.created).toContain(join(home, "policy.json"));
  expect(existsSync(join(home, "signing"))).toBe(true);

  // the policy skeleton is itself a valid policy (parses, has rules)
  expect(JSON.parse(readFileSync(join(home, "policy.json"), "utf8"))).toEqual({ rules: [] });

  rmSync(home, { recursive: true, force: true });
});

test("init does not clobber existing files without --force, but does with it", () => {
  const home = tempHome();
  initCommand({ AGP_HOME: home });

  // operator-customized policy
  writeFileSync(join(home, "policy.json"), JSON.stringify({ rules: [{ id: "custom" }] }));

  const second = initCommand({ AGP_HOME: home });
  expect(second.skipped).toContain(join(home, "policy.json"));
  expect(JSON.parse(readFileSync(join(home, "policy.json"), "utf8"))).toEqual({
    rules: [{ id: "custom" }],
  });

  const forced = initCommand({ AGP_HOME: home }, { force: true });
  expect(forced.created).toContain(join(home, "policy.json"));
  expect(JSON.parse(readFileSync(join(home, "policy.json"), "utf8"))).toEqual({ rules: [] });

  rmSync(home, { recursive: true, force: true });
});
