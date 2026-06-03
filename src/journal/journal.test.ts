import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { Journal, headPath } from "./journal.ts";
import { verifyJournalFile } from "./verify.ts";
import {
  generateSigningKeyPem,
  loadPrivateKey,
  loadPublicKey,
  publicKeyFromPrivate,
} from "../runtime/crypto.ts";

interface Setup {
  dir: string;
  path: string;
  priv: KeyObject;
  pub: KeyObject;
}

const FIXED = () => "2026-06-02T00:00:00.000Z";

function build(events = 3): Setup {
  const dir = mkdtempSync(join(tmpdir(), "agp-journal-"));
  const path = join(dir, "audit.log");
  const priv = loadPrivateKey(generateSigningKeyPem().privateKeyPem);
  const j = new Journal(path, priv, FIXED);
  for (let i = 0; i < events; i++) j.append({ kind: `e${i}`, actor: "session_owner", payload: { i } });
  return { dir, path, priv, pub: publicKeyFromPrivate(priv) };
}

function lines(path: string): string[] {
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim().length > 0);
}

test("a valid journal verifies offline with the PUBLIC key only", () => {
  const { dir, path, priv } = build();
  // export the public key the way keygen does, then verify with that alone
  const pubPem = publicKeyFromPrivate(priv).export({ type: "spki", format: "pem" }).toString();
  const result = verifyJournalFile(path, loadPublicKey(pubPem));
  expect(result.ok).toBe(true);
  expect(result.count).toBe(3);
  rmSync(dir, { recursive: true, force: true });
});

test("catches an EDIT (payload tamper → hash mismatch)", () => {
  const { dir, path, pub } = build();
  const ls = lines(path);
  const ev = JSON.parse(ls[1]!);
  ev.payload = { i: 999 };
  ls[1] = JSON.stringify(ev);
  writeFileSync(path, ls.join("\n") + "\n");
  const r = verifyJournalFile(path, pub);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toContain("hash mismatch");
  rmSync(dir, { recursive: true, force: true });
});

test("catches an INSERTION (extra event breaks seq + chain)", () => {
  const { dir, path, pub } = build();
  const ls = lines(path);
  ls.splice(1, 0, ls[1]!); // duplicate-insert
  writeFileSync(path, ls.join("\n") + "\n");
  expect(verifyJournalFile(path, pub).ok).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});

test("catches a REORDER (swapped events)", () => {
  const { dir, path, pub } = build();
  const ls = lines(path);
  [ls[0], ls[1]] = [ls[1]!, ls[0]!];
  writeFileSync(path, ls.join("\n") + "\n");
  expect(verifyJournalFile(path, pub).ok).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});

test("catches an INVALID SIGNATURE", () => {
  const { dir, path, pub } = build();
  const ls = lines(path);
  const ev = JSON.parse(ls[0]!);
  const first = ev.signature[0] === "A" ? "B" : "A";
  ev.signature = first + ev.signature.slice(1); // still 88-char base64, wrong sig
  ls[0] = JSON.stringify(ev);
  writeFileSync(path, ls.join("\n") + "\n");
  const r = verifyJournalFile(path, pub);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toContain("signature invalid");
  rmSync(dir, { recursive: true, force: true });
});

test("catches a SIGNED→UNSIGNED ROLLBACK (v1/unsigned event)", () => {
  const { dir, path, pub } = build();
  const ls = lines(path);
  const ev = JSON.parse(ls[0]!);
  delete ev.signature;
  ev.v = 1; // downgrade to unsigned
  ls[0] = JSON.stringify(ev);
  writeFileSync(path, ls.join("\n") + "\n");
  const r = verifyJournalFile(path, pub);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toContain("rollback");
  rmSync(dir, { recursive: true, force: true });
});

test("catches TRUNCATION (tail removed, signed head still pins it)", () => {
  const { dir, path, pub } = build();
  const ls = lines(path);
  ls.pop(); // drop the last event; .head still points at it
  writeFileSync(path, ls.join("\n") + "\n");
  const r = verifyJournalFile(path, pub);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toContain("truncation");
  rmSync(dir, { recursive: true, force: true });
});

test("catches a FORGED HEAD checkpoint (signature invalid)", () => {
  const { dir, path, pub } = build();
  const head = JSON.parse(readFileSync(headPath(path), "utf8"));
  head.seq = 99; // lie about the tail without re-signing
  writeFileSync(headPath(path), JSON.stringify(head) + "\n");
  const r = verifyJournalFile(path, pub);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toContain("head checkpoint signature invalid");
  rmSync(dir, { recursive: true, force: true });
});
