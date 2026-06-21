import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Ed25519Verifier,
  ed25519Fingerprint,
  intendantEd25519Uri,
  loadEd25519Verifier,
  signManifest,
} from "./ed25519-verifier.ts";
import { generateSigningKeyPem, loadPrivateKey, loadPublicKey, publicKeyFromPrivate } from "../runtime/crypto.ts";
import type { IntendantManifest } from "../contracts/intendant-manifest.ts";

function keypair() {
  const { privateKeyPem, publicKeyPem } = generateSigningKeyPem();
  return { priv: loadPrivateKey(privateKeyPem), pub: loadPublicKey(publicKeyPem), publicKeyPem };
}

const MANIFEST: IntendantManifest = { name: "claude-code", version: "2.1.0" };

test("a manifest signed by a trusted key verifies and mints the deterministic URI", async () => {
  const { priv, pub } = keypair();
  const sig = signManifest(MANIFEST, priv);
  const res = await new Ed25519Verifier([pub]).verify(MANIFEST, sig);
  expect(res.ok).toBe(true);
  if (res.ok) {
    const fp = ed25519Fingerprint(pub);
    expect(res.identity).toEqual({
      name: "claude-code",
      version: "2.1.0",
      uri: intendantEd25519Uri("claude-code", "2.1.0", fp),
    });
    expect(res.identity.uri).toMatch(/^agp-intendant:ed25519\/claude-code@2\.1\.0\/[0-9a-f]{16}$/);
  }
});

test("a tampered manifest fails with bad-signature (not a throw)", async () => {
  const { priv, pub } = keypair();
  const sig = signManifest(MANIFEST, priv);
  const res = await new Ed25519Verifier([pub]).verify({ name: "claude-code", version: "9.9.9" }, sig);
  expect(res).toEqual({ ok: false, reason: "bad-signature" });
});

test("a signature from an UNtrusted key fails with bad-signature", async () => {
  const author = keypair();
  const attacker = keypair();
  const sig = signManifest(MANIFEST, attacker.priv);
  const res = await new Ed25519Verifier([author.pub]).verify(MANIFEST, sig);
  expect(res).toEqual({ ok: false, reason: "bad-signature" });
});

test("an empty trust set fails closed with unknown-key", async () => {
  const { priv } = keypair();
  const sig = signManifest(MANIFEST, priv);
  const res = await new Ed25519Verifier([]).verify(MANIFEST, sig);
  expect(res).toEqual({ ok: false, reason: "unknown-key" });
});

test("a malformed manifest fails with malformed-manifest", async () => {
  const { pub } = keypair();
  const res = await new Ed25519Verifier([pub]).verify({ name: "", version: "1.0.0" } as IntendantManifest, "x");
  expect(res).toEqual({ ok: false, reason: "malformed-manifest" });
});

test("a non-64-byte signature fails with malformed-signature", async () => {
  const { pub } = keypair();
  const res = await new Ed25519Verifier([pub]).verify(MANIFEST, "AAAA"); // 3 bytes
  expect(res).toEqual({ ok: false, reason: "malformed-signature" });
});

test("verify accepts the manifest against the FIRST matching trusted key (multi-key)", async () => {
  const stale = keypair();
  const current = keypair();
  const sig = signManifest(MANIFEST, current.priv);
  const res = await new Ed25519Verifier([stale.pub, current.pub]).verify(MANIFEST, sig);
  expect(res.ok).toBe(true);
  if (res.ok) expect(res.identity.uri!.endsWith(ed25519Fingerprint(current.pub))).toBe(true);
});

test("ed25519Fingerprint is stable across calls and derived from the public key", () => {
  const { priv, pub } = keypair();
  expect(ed25519Fingerprint(pub)).toBe(ed25519Fingerprint(pub));
  expect(ed25519Fingerprint(pub)).toBe(ed25519Fingerprint(publicKeyFromPrivate(priv)));
  expect(ed25519Fingerprint(pub)).toMatch(/^[0-9a-f]{16}$/);
});

test("loadEd25519Verifier: reads a trusted key file, fails closed on missing/corrupt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agp-trust-"));
  const path = join(dir, "ed25519.pub");
  const { priv, publicKeyPem } = keypair();
  writeFileSync(path, publicKeyPem);
  const sig = signManifest(MANIFEST, priv);
  expect((await loadEd25519Verifier(path).verify(MANIFEST, sig)).ok).toBe(true);
  // Missing file ⇒ empty trust set ⇒ fail closed.
  expect(await loadEd25519Verifier(join(dir, "nope.pub")).verify(MANIFEST, sig)).toEqual({
    ok: false,
    reason: "unknown-key",
  });
  // Corrupt key file ⇒ fail closed, no throw.
  writeFileSync(path, "not a pem");
  expect((await loadEd25519Verifier(path).verify(MANIFEST, sig)).ok).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});
