// `agp init` — scaffold the operator config home (~/.agp).
//
// Creates the config + policy skeletons and the signing directory. It does NOT
// generate the signing key: minting an Ed25519 key is a deliberate security
// step, and `agp doctor` will (correctly, fail-closed) report the key missing
// until the operator creates it. init never clobbers existing files without
// --force, so re-running is safe.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { type AgpPaths, resolvePaths } from "../../config.ts";

export interface InitOptions {
  force?: boolean;
}

export interface InitResult {
  code: number;
  created: string[];
  skipped: string[];
  message: string;
}

const CONFIG_SKELETON =
  JSON.stringify(
    {
      slack: { botToken: "", appToken: "", channel: "" },
      sandbox: { image: "" },
    },
    null,
    2,
  ) + "\n";

// Minimal valid policy: an empty rule set. Fail-closed semantics live in the
// policy engine (Epic 09); an empty ruleset still parses as a valid policy.
const POLICY_SKELETON = JSON.stringify({ rules: [] }, null, 2) + "\n";

export function initCommand(
  env: Record<string, string | undefined> = process.env,
  opts: InitOptions = {},
): InitResult {
  const paths: AgpPaths = resolvePaths(env);
  const created: string[] = [];
  const skipped: string[] = [];

  mkdirSync(paths.signingDir, { recursive: true });

  const files: ReadonlyArray<readonly [string, string]> = [
    [paths.config, CONFIG_SKELETON],
    [paths.policy, POLICY_SKELETON],
  ];

  for (const [path, content] of files) {
    if (existsSync(path) && !opts.force) {
      skipped.push(path);
      continue;
    }
    writeFileSync(path, content);
    created.push(path);
  }

  const message = [
    `AGP config home: ${paths.home}`,
    "Next steps:",
    `  1. Fill Slack credentials in ${paths.config} (or set AGP_SLACK_BOT_TOKEN / AGP_SLACK_APP_TOKEN / AGP_SLACK_CHANNEL).`,
    `  2. Generate the Ed25519 journal-signing key at ${paths.signingKey}.`,
    `  3. Define gating rules in ${paths.policy}.`,
    "  4. Run `agp doctor` to verify.",
  ].join("\n");

  return { code: 0, created, skipped, message };
}
