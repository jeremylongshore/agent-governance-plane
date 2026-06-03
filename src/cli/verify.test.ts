import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keygenCommand } from "./commands/keygen.ts";
import { verifyCommand } from "./commands/verify.ts";
import { resolvePaths } from "../config.ts";
import { Journal } from "../journal/journal.ts";
import { loadPrivateKey } from "../runtime/crypto.ts";

function seededHome(events = 2): { home: string; journalPath: string } {
  const home = mkdtempSync(join(tmpdir(), "agp-verify-"));
  const env = { AGP_HOME: home };
  keygenCommand(env); // writes private + public key
  const paths = resolvePaths(env);
  const priv = loadPrivateKey(readFileSync(paths.signingKey, "utf8"));
  const j = new Journal(paths.journal, priv, () => "2026-06-02T00:00:00.000Z");
  for (let i = 0; i < events; i++) j.append({ kind: `e${i}`, actor: "session_owner", payload: { i } });
  return { home, journalPath: paths.journal };
}

test("agp verify exits 0 on a valid journal (offline, public key from keygen)", () => {
  const { home } = seededHome();
  const code = verifyCommand([], { AGP_HOME: home }, () => {});
  expect(code).toBe(0);
  rmSync(home, { recursive: true, force: true });
});

test("agp verify exits non-zero on tampering and reports it", () => {
  const { home, journalPath } = seededHome();
  const ls = readFileSync(journalPath, "utf8").split("\n").filter((l) => l.trim());
  const ev = JSON.parse(ls[0]!);
  ev.payload = { i: 666 };
  ls[0] = JSON.stringify(ev);
  writeFileSync(journalPath, ls.join("\n") + "\n");

  const out: string[] = [];
  const code = verifyCommand([], { AGP_HOME: home }, (l) => out.push(l));
  expect(code).toBe(1);
  expect(out.some((l) => l.includes("✗"))).toBe(true);
  rmSync(home, { recursive: true, force: true });
});

test("agp verify accepts an explicit journal path argument", () => {
  const { home, journalPath } = seededHome();
  const code = verifyCommand([journalPath], { AGP_HOME: home }, () => {});
  expect(code).toBe(0);
  rmSync(home, { recursive: true, force: true });
});

test("agp verify fails closed when no verification key exists", () => {
  const home = mkdtempSync(join(tmpdir(), "agp-verify-"));
  const out: string[] = [];
  const code = verifyCommand([], { AGP_HOME: home }, (l) => out.push(l));
  expect(code).toBe(1);
  expect(out.join(" ")).toContain("no verification key");
  rmSync(home, { recursive: true, force: true });
});
