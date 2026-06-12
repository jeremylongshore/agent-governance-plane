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
import { keygenCommand } from "./commands/keygen.ts";
import { runCommand } from "./commands/run.ts";
import { verifyCommand } from "./commands/verify.ts";
import { sessionsCommand } from "./commands/sessions.ts";
import { bridgeCommand } from "./commands/bridge.ts";

const USAGE = `agp — agent governance plane

Usage: agp <command> [options]

Commands:
  init        Scaffold the operator config home (~/.agp): config + policy skeletons + signing dir
              --force   overwrite existing config/policy files
  keygen      Generate the Ed25519 journal-signing key (--force to replace)
  doctor      Validate prerequisites (Docker, Slack, signing key, policy) — fail-closed
              --check <name>   run only one check (e.g. --check policy)
  run         Drive a session through the governance loop (v0: reference mode) — fail-closed
              --intendant <name>   harness to drive: scripted (default) | claude-code
              --task <prompt>   (live claude) the task to fix; needs AGP_CLAUDE_LIVE=1
              --repo <path>     (live claude) the repo to run in
  bridge      PreToolUse hook bridge (internal; Claude runs this per tool call)
              --socket <path>   the session gateway socket to gate against
  verify      Verify the audit journal (hash chain + signatures), offline
  sessions    List the sessions recorded in the audit journal
  help        Show this help

Claude auth: the Claude Code intendant reuses your existing Claude Code login
session — AGP holds no Anthropic API key.
`;

export async function main(argv: string[]): Promise<number> {
  const cmd = argv[0];
  switch (cmd) {
    case "init": {
      const res = initCommand(process.env, { force: argv.includes("--force") });
      for (const c of res.created) console.log(`created  ${c}`);
      for (const s of res.skipped) console.log(`skipped  ${s} (exists; use --force to overwrite)`);
      console.log(res.message);
      return res.code;
    }
    case "keygen": {
      const res = keygenCommand(process.env, { force: argv.includes("--force") });
      console.log(res.message);
      return res.code;
    }
    case "doctor": {
      const ci = argv.indexOf("--check");
      const only = ci >= 0 ? argv[ci + 1] : undefined;
      return doctorCommand(process.env, console.log, only);
    }
    case "run": {
      const si = argv.indexOf("--intendant");
      const intendantSel = si >= 0 ? argv[si + 1] : undefined;
      const ti = argv.indexOf("--task");
      const task = ti >= 0 ? argv[ti + 1] : undefined;
      const ri = argv.indexOf("--repo");
      const repo = ri >= 0 ? argv[ri + 1] : undefined;
      return runCommand(process.env, console.log, { intendant: intendantSel, task, repo });
    }
    case "bridge": {
      const stdin = await Bun.stdin.text();
      return bridgeCommand(argv.slice(1), stdin);
    }
    case "verify":
      return verifyCommand(argv.slice(1));
    case "sessions":
      return sessionsCommand();
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
  process.exit(await main(process.argv.slice(2)));
}
