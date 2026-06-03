// `agp verify [journal-path]` — offline verification of an audit journal: chain
// + signatures + signed head checkpoint (truncation). Verifies with the PUBLIC
// key (no private key needed), so a third party can verify an exported journal.
// Defaults to ~/.agp/audit.log; accepts a path argument for any session log.

import { existsSync, readFileSync } from "node:fs";
import { resolvePaths } from "../../config.ts";
import { loadPublicKey, loadPrivateKey, publicKeyFromPrivate } from "../../runtime/crypto.ts";
import { verifyJournalFile } from "../../journal/verify.ts";
import type { KeyObject } from "node:crypto";

export function verifyCommand(
  argv: string[] = [],
  env: Record<string, string | undefined> = process.env,
  out: (line: string) => void = console.log,
): number {
  const paths = resolvePaths(env);
  const journalPath = argv[0] && !argv[0].startsWith("-") ? argv[0] : paths.journal;

  // Prefer the public key (true offline verify); fall back to deriving it from
  // the private key for a local operator who has not exported the public key.
  let publicKey: KeyObject;
  try {
    if (existsSync(paths.signingPubKey)) {
      publicKey = loadPublicKey(readFileSync(paths.signingPubKey, "utf8"));
    } else if (existsSync(paths.signingKey)) {
      publicKey = publicKeyFromPrivate(loadPrivateKey(readFileSync(paths.signingKey, "utf8")));
    } else {
      out(`agp verify: no verification key (looked for ${paths.signingPubKey}). Run \`agp keygen\`. (fail-closed)`);
      return 1;
    }
  } catch (err) {
    out(`agp verify: cannot load verification key: ${(err as Error).message} (fail-closed)`);
    return 1;
  }

  const result = verifyJournalFile(journalPath, publicKey);
  out(`agp verify: ${result.count} event(s) in ${journalPath}`);
  if (result.ok) {
    out("✓ journal intact — chain, signatures, and signed head verified.");
    return 0;
  }
  for (const e of result.errors) out(`✗ ${e}`);
  return 1;
}
