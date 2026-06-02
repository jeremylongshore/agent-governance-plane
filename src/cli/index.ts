#!/usr/bin/env bun
// `agp` — the operator command surface for the agent governance plane.
//
// Implemented at v0: init, doctor (fail-closed prerequisite validation).
// Registered but pending the Epic 03 contracts + Epic 04 daemon: run, verify,
// sessions. `main` is pure (returns an exit code) and only runs the process
// when this file is executed directly, so tests can import the command modules
// freely.

import { doctorCommand } from "./commands/doctor.ts";
import { initCommand } from "./commands/init.ts";
import { pendingCommand } from "./commands/pending.ts";

const USAGE = `agp — agent governance plane

Usage: agp <command> [options]

Commands:
  init        Scaffold the operator config home (~/.agp): config + policy skeletons + signing dir
              --force   overwrite existing config/policy files
  doctor      Validate prerequisites (Docker, Slack, signing key, policy) — fail-closed
  run         [pending: Epic 03 contracts + Epic 04 daemon]
  verify      [pending: Epic 03 contracts + Epic 04 daemon]
  sessions    [pending: Epic 03 contracts + Epic 04 daemon]
  help        Show this help

Claude auth: the Claude Code sprite reuses your existing Claude Code login
session — AGP holds no Anthropic API key.
`;

export function main(argv: string[]): number {
  const cmd = argv[0];
  switch (cmd) {
    case "init": {
      const res = initCommand(process.env, { force: argv.includes("--force") });
      for (const c of res.created) console.log(`created  ${c}`);
      for (const s of res.skipped) console.log(`skipped  ${s} (exists; use --force to overwrite)`);
      console.log(res.message);
      return res.code;
    }
    case "doctor":
      return doctorCommand();
    case "run":
    case "verify":
    case "sessions":
      return pendingCommand(cmd);
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return 0;
    case undefined:
      console.log(USAGE);
      return 1;
    default:
      console.error(`agp: unknown command '${cmd}'\n`);
      console.error(USAGE);
      return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
