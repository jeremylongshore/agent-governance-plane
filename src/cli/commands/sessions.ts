// `agp sessions` — list the agent sessions recorded in the audit journal,
// derived from session.started / session.ended events.

import { existsSync } from "node:fs";
import { resolvePaths } from "../../config.ts";
import { readEvents } from "../../journal/journal.ts";

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function sessionsCommand(
  env: Record<string, string | undefined> = process.env,
  out: (line: string) => void = console.log,
): number {
  const paths = resolvePaths(env);
  if (!existsSync(paths.journal)) {
    out("agp sessions: no journal yet — run `agp run` first.");
    return 0;
  }

  const events = readEvents(paths.journal);
  const sessions = new Map<string, { started: string | null; calls: number | null }>();

  for (const ev of events) {
    const sid = str(ev.payload.sessionId);
    if (sid === null) continue;
    const entry = sessions.get(sid) ?? { started: null, calls: null };
    if (ev.kind === "session.started") entry.started = ev.ts;
    if (ev.kind === "session.ended") {
      const calls = ev.payload.calls;
      entry.calls = typeof calls === "number" ? calls : entry.calls;
    }
    sessions.set(sid, entry);
  }

  if (sessions.size === 0) {
    out("agp sessions: no sessions recorded.");
    return 0;
  }

  out(`agp sessions: ${sessions.size} session(s)`);
  for (const [sid, info] of sessions) {
    const when = info.started ?? "(start not recorded)";
    const calls = info.calls === null ? "?" : String(info.calls);
    out(`  ${sid}  started=${when}  calls=${calls}`);
  }
  return 0;
}
