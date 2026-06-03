// Fail-closed prerequisite checks for `agp doctor`.
//
// The checks are expressed as a pure function over an injected `DoctorProbe`
// so they are testable without Docker/Slack/keys present and without mocking
// the function under test: real runs pass the filesystem/Docker-backed probe
// (cli/probe.ts); tests pass a hand-built probe with known answers.
//
// Fail-closed is the whole point: a check that cannot prove a prerequisite is
// satisfied reports `fail`, never `ok`.

export type CheckStatus = "ok" | "fail";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

/** One method per prerequisite. Each returns whether it is satisfied + why. */
export interface DoctorProbe {
  /** Docker CLI present AND the daemon reachable. */
  docker(): { ok: boolean; detail: string };
  /** Slack bot token, app token, and target channel all configured. */
  slack(): { ok: boolean; detail: string };
  /** Ed25519 journal-signing key present at the configured path. */
  signing(): { ok: boolean; detail: string };
  /** Policy file present AND parses to a valid policy. */
  policy(): { ok: boolean; detail: string };
}

const CHECK_ORDER: ReadonlyArray<{ name: string; run: (p: DoctorProbe) => { ok: boolean; detail: string } }> = [
  { name: "docker", run: (p) => p.docker() },
  { name: "slack", run: (p) => p.slack() },
  { name: "signing", run: (p) => p.signing() },
  { name: "policy", run: (p) => p.policy() },
];

export interface DoctorReport {
  ok: boolean;
  results: CheckResult[];
}

/**
 * Run prerequisite checks. With `only`, run just that named check (e.g.
 * `agp doctor --check policy`). `ok` is true only when every run check passed —
 * fail-closed by construction.
 */
export function runDoctor(probe: DoctorProbe, only?: string): DoctorReport {
  const selected = only ? CHECK_ORDER.filter((c) => c.name === only) : CHECK_ORDER;
  if (only && selected.length === 0) {
    const valid = CHECK_ORDER.map((c) => c.name).join(", ");
    return {
      ok: false,
      results: [{ name: only, status: "fail", detail: `unknown check '${only}' (valid: ${valid})` }],
    };
  }
  const results: CheckResult[] = selected.map(({ name, run }) => {
    const { ok, detail } = run(probe);
    return { name, status: ok ? "ok" : "fail", detail };
  });
  return { ok: results.every((r) => r.status === "ok"), results };
}
