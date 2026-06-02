// `agp run` — drive an agent session through the governance loop. At v0 this is
// REFERENCE mode: a scripted sprite, recording sandbox, and console channel. It
// fails closed on a missing/invalid signing key or policy (the things it needs
// to journal and gate). Production mode (Docker sandbox + Slack channel) lands
// with Epics 07/08.

import { existsSync, readFileSync } from "node:fs";
import { resolvePaths } from "../../config.ts";
import { loadPrivateKey } from "../../runtime/crypto.ts";
import { RefJournal } from "../../runtime/journal.ts";
import { loadPolicyEvaluator } from "../../runtime/policy.ts";
import { RecordingSandbox } from "../../runtime/sandbox.ts";
import { ConsoleChannel } from "../../runtime/channel.ts";
import { ScriptedSprite } from "../../runtime/sprite.ts";
import { Daemon } from "../../daemon/daemon.ts";

export async function runCommand(
  env: Record<string, string | undefined> = process.env,
  out: (line: string) => void = console.log,
): Promise<number> {
  const paths = resolvePaths(env);

  if (!existsSync(paths.signingKey)) {
    out(`agp run: signing key missing at ${paths.signingKey} — run \`agp keygen\`. (fail-closed)`);
    return 1;
  }
  if (!existsSync(paths.policy)) {
    out(`agp run: policy missing at ${paths.policy} — run \`agp init\`. (fail-closed)`);
    return 1;
  }

  let privateKey;
  try {
    privateKey = loadPrivateKey(readFileSync(paths.signingKey, "utf8"));
  } catch (err) {
    out(`agp run: cannot load signing key: ${(err as Error).message} (fail-closed)`);
    return 1;
  }

  let policy;
  try {
    policy = loadPolicyEvaluator(paths.policy);
  } catch (err) {
    out(`agp run: invalid policy: ${(err as Error).message} (fail-closed)`);
    return 1;
  }

  out("agp run: REFERENCE mode — recording sandbox + console channel (NOT Docker/Slack).");
  const daemon = new Daemon({
    policy,
    journal: new RefJournal(paths.journal, privateKey),
    sandbox: new RecordingSandbox(),
    channel: new ConsoleChannel(env, out),
  });

  const result = await daemon.runScripted(new ScriptedSprite());

  out(`\nsession ${result.sessionId} — ${result.outcomes.length} tool call(s):`);
  for (const o of result.outcomes) {
    const approval = o.approved === null ? "" : ` → approval ${o.approved ? "granted" : "denied"}`;
    out(`  ${o.request.tool}: ${o.verdict.decision}${approval}${o.executed ? " → executed" : ""}`);
  }
  out(`\njournal: ${paths.journal} — verify with \`agp verify\`.`);
  return 0;
}
