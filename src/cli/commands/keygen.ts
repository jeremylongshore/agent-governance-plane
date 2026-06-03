// `agp keygen` — generate the Ed25519 journal-signing keypair: the private key
// (0600) and the public key (for offline verification). Refuses to overwrite
// without --force; with --force it ROTATES — the old keypair is backed up (a new
// key starts a fresh signing era, since signing_key_id stays null at v0, so it
// does not retro-verify the prior journal).

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
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
      message: `signing key already exists at ${paths.signingKey} (use --force to rotate — a new key does not retro-verify the existing journal)`,
    };
  }

  mkdirSync(dirname(paths.signingKey), { recursive: true });

  // Rotation: archive the existing keypair before replacing it.
  const lines: string[] = [];
  if (existsSync(paths.signingKey) && opts.force) {
    const stamp = Date.now();
    renameSync(paths.signingKey, `${paths.signingKey}.bak-${stamp}`);
    if (existsSync(paths.signingPubKey)) renameSync(paths.signingPubKey, `${paths.signingPubKey}.bak-${stamp}`);
    lines.push(`rotated: previous key archived as ${paths.signingKey}.bak-${stamp}`);
  }

  const { privateKeyPem, publicKeyPem } = generateSigningKeyPem();
  writeFileSync(paths.signingKey, privateKeyPem, { mode: 0o600 });
  writeFileSync(paths.signingPubKey, publicKeyPem, { mode: 0o644 });

  lines.push(`wrote private key ${paths.signingKey}`, `wrote public key  ${paths.signingPubKey}`);
  return { code: 0, message: lines.join("\n") };
}
