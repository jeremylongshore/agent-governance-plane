// `agp verify` — offline verification of the audit journal: re-derives every
// event's hash and Ed25519 signature and checks the chain links. Any tampering
// or broken link fails (exit 1). At v0 the operator holds the signing key, so
// the public key is derived from it; a verify-only public-key path lands later.

import { existsSync, readFileSync } from "node:fs";
import { resolvePaths } from "../../config.ts";
import { loadPrivateKey, publicKeyFromPrivate } from "../../runtime/crypto.ts";
import { verifyJournal } from "../../runtime/journal.ts";

export function verifyCommand(
  env: Record<string, string | undefined> = process.env,
  out: (line: string) => void = console.log,
): number {
  const paths = resolvePaths(env);

  if (!existsSync(paths.signingKey)) {
    out(`agp verify: signing key missing at ${paths.signingKey} — cannot derive the verification key. (fail-closed)`);
    return 1;
  }
  if (!existsSync(paths.journal)) {
    out(`agp verify: no journal at ${paths.journal}.`);
    return 1;
  }

  let publicKey;
  try {
    publicKey = publicKeyFromPrivate(loadPrivateKey(readFileSync(paths.signingKey, "utf8")));
  } catch (err) {
    out(`agp verify: cannot load signing key: ${(err as Error).message} (fail-closed)`);
    return 1;
  }

  const result = verifyJournal(paths.journal, publicKey);
  out(`agp verify: ${result.count} event(s)`);
  if (result.ok) {
    out("✓ journal intact — hash chain and signatures verified.");
    return 0;
  }
  for (const e of result.errors) out(`✗ ${e}`);
  return 1;
}
