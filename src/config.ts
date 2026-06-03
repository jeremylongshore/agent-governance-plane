// AGP configuration layout and resolution.
//
// AGP is operator-owned and single-tenant at v0. All operator state lives under
// a single config home (default ~/.agp), overridable via $AGP_HOME for tests and
// alternate installs. Nothing here talks to Docker, Slack, or the signing key —
// it only resolves *where* those things are configured. The doctor checks
// (cli/checks.ts) decide whether they are actually present and valid.

import { homedir } from "node:os";
import { join } from "node:path";

export interface AgpPaths {
  /** Config home, default ~/.agp (overridable via $AGP_HOME). */
  home: string;
  /** Operator config file (Slack workspace/channel, sandbox opts). */
  config: string;
  /** Directory holding the Ed25519 journal-signing key. */
  signingDir: string;
  /** The Ed25519 private signing key for the audit journal. */
  signingKey: string;
  /** The Ed25519 public key — used for offline verification (no private key). */
  signingPubKey: string;
  /** The policy file gating tool calls. */
  policy: string;
  /** The authoritative hash-chained audit journal (written at runtime). */
  journal: string;
}

/**
 * Resolve AGP paths from the environment. Pure: takes an env map so tests can
 * pin $AGP_HOME without touching the real home directory.
 */
export function resolvePaths(env: Record<string, string | undefined> = process.env): AgpPaths {
  const home = env.AGP_HOME && env.AGP_HOME.length > 0 ? env.AGP_HOME : join(homedir(), ".agp");
  return {
    home,
    config: join(home, "config.json"),
    signingDir: join(home, "signing"),
    signingKey: join(home, "signing", "journal-ed25519.key"),
    signingPubKey: join(home, "signing", "journal-ed25519.pub"),
    policy: join(home, "policy.json"),
    journal: join(home, "audit.log"),
  };
}

/** Shape of the operator config file. Slack creds may also come from env. */
export interface AgpConfig {
  slack?: {
    botToken?: string;
    appToken?: string;
    channel?: string;
  };
  sandbox?: {
    image?: string;
  };
}
