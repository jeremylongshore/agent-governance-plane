// `agp keygen` — generate the Ed25519 journal-signing key at the configured
// path. Refuses to overwrite without --force (a regenerated key invalidates the
// existing journal's signatures). Written 0600.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolvePaths } from "../../config.ts";
import { generateSigningKeyPem } from "../../runtime/crypto.ts";

export function keygenCommand(
  env: Record<string, string | undefined> = process.env,
  opts: { force?: boolean } = {},
): { code: number; message: string } {
  const paths = resolvePaths(env);
  if (existsSync(paths.signingKey) && !opts.force) {
    return {
      code: 1,
      message: `signing key already exists at ${paths.signingKey} (use --force to replace — this invalidates the existing journal's signatures)`,
    };
  }
  mkdirSync(dirname(paths.signingKey), { recursive: true });
  const { privateKeyPem } = generateSigningKeyPem();
  writeFileSync(paths.signingKey, privateKeyPem, { mode: 0o600 });
  return { code: 0, message: `wrote Ed25519 journal-signing key to ${paths.signingKey}` };
}
