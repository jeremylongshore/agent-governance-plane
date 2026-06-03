// `agp doctor` — validate operator prerequisites, fail-closed.
// Thin wrapper over the pure runDoctor (checks.ts) + the real FsDoctorProbe.

import { runDoctor } from "../checks.ts";
import { FsDoctorProbe } from "../probe.ts";

export function doctorCommand(
  env: Record<string, string | undefined> = process.env,
  out: (line: string) => void = console.log,
  only?: string,
): number {
  const report = runDoctor(new FsDoctorProbe(env), only);
  for (const r of report.results) {
    out(`${r.status === "ok" ? "✓" : "✗"} ${r.name.padEnd(8)} ${r.detail}`);
  }
  out(
    report.ok
      ? "\nagp doctor: all prerequisites satisfied."
      : "\nagp doctor: prerequisites missing — resolve the ✗ items above. (fail-closed)",
  );
  return report.ok ? 0 : 1;
}
