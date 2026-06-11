// Credential injection — resolve secret PLACEHOLDERS to real secret values ONLY
// at the gateway's exec boundary, after the policy gate, never anywhere a secret
// could leak into the protocol or the audit journal.
//
// Mechanism (canonical per 000-docs/034-AT-ARCH-credential-injection.md):
//   - A sprite emits a tool_call_request whose `args` contain an OPAQUE
//     placeholder string `{{secret:NAME}}` — the secret VALUE never crosses the
//     gateway protocol, so it never enters a GatewayMessage or the journal.
//   - The control-plane Daemon resolves the placeholder to the real secret ONLY
//     in the argv it hands to `sandbox.exec`, immediately before execution.
//   - The container is never spawned with secret env (DockerSandbox passes no
//     -e/--env); the secret lives only in the daemon process + the post-gate
//     argv. The journal records WHICH secret names were used, never the values.
//
// This is the gateway-side execution model the master blueprint commits to
// (002 §2.1/§4.1), NOT a sprite-side env-placeholder swap (explicitly rejected;
// see the design doc). No GatewayMessage / SandboxSpec schema change is needed —
// `args` is already `z.record(string, unknown)`, so a placeholder is just a
// string value.
//
// Honest boundary: the resolved secret IS visible in the host process table of
// `docker exec` (host-side, not in-container), and a tool the sprite is allowed
// to run can still use — and potentially echo — the secret. `redactSecrets` is
// best-effort defense-in-depth against an echo, not a guarantee.

/** Where real secret values live (control plane). DI seam — tests inject a fake. */
export interface SecretVault {
  /** The secret value for a name, or undefined if not held. */
  get(name: string): string | undefined;
}

/** Env prefix a secret name is read under, e.g. AGP_SECRET_GITHUB_TOKEN. */
export const SECRET_ENV_PREFIX = "AGP_SECRET_";

/** Matches a placeholder token a sprite may emit in an arg value. */
export const PLACEHOLDER_RE = /\{\{secret:([A-Za-z0-9_]+)\}\}/g;

/**
 * Default vault: reads secrets from an injected env map (process.env by default),
 * namespaced by SECRET_ENV_PREFIX. Mirrors resolveSlackCreds's env-first idiom.
 */
export class EnvSecretVault implements SecretVault {
  private readonly env: Record<string, string | undefined>;
  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }
  get(name: string): string | undefined {
    return this.env[SECRET_ENV_PREFIX + name];
  }
}

/**
 * Recursively scan a JSON value and return the DISTINCT secret names referenced
 * by `{{secret:NAME}}` placeholders. Names only — used to journal which secrets
 * a call used, never their values.
 */
export function findPlaceholders(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      for (const m of v.matchAll(PLACEHOLDER_RE)) {
        // m[1] is the captured NAME — always present given the regex shape.
        found.add(m[1] as string);
      }
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item);
    } else if (v !== null && typeof v === "object") {
      for (const item of Object.values(v)) walk(item);
    }
  };
  walk(value);
  return [...found];
}

/** Replace every placeholder in a string against the vault. Throws if absent. */
function resolveString(s: string, vault: SecretVault): string {
  return s.replace(PLACEHOLDER_RE, (_match, name: string) => {
    const secret = vault.get(name);
    if (secret === undefined) {
      // FAIL CLOSED: never leave the literal placeholder in argv, never blank it.
      throw new Error(`unresolved secret placeholder: ${name}`);
    }
    return secret;
  });
}

/**
 * Deep-clone a JSON value with every `{{secret:NAME}}` placeholder replaced by
 * the vault's secret value. FAIL CLOSED: a referenced-but-absent secret throws
 * rather than passing the literal placeholder or a silent blank to exec.
 */
export function resolvePlaceholders(value: unknown, vault: SecretVault): unknown {
  if (typeof value === "string") return resolveString(value, vault);
  if (Array.isArray(value)) return value.map((v) => resolvePlaceholders(v, vault));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolvePlaceholders(v, vault);
    return out;
  }
  return value;
}

/**
 * Resolve the secret VALUES referenced by a JSON value, for redaction. Returns
 * the distinct non-empty values for placeholders the vault can satisfy; silently
 * skips any the vault lacks (resolvePlaceholders is the fail-closed authority).
 */
export function resolvedSecretValues(value: unknown, vault: SecretVault): string[] {
  const vals = new Set<string>();
  for (const name of findPlaceholders(value)) {
    const v = vault.get(name);
    if (v !== undefined && v.length > 0) vals.add(v);
  }
  return [...vals];
}

const REDACTION = "***";

/**
 * Replace any occurrence of a known secret value in a (tool OUTPUT) JSON value
 * with `***`, before it goes into ToolCallResult.output / the journal. Best-effort
 * defense-in-depth against a tool echoing a secret back; not a guarantee.
 */
export function redactSecrets(value: unknown, secretValues: readonly string[]): unknown {
  const nonEmpty = secretValues.filter((s) => s.length > 0);
  if (nonEmpty.length === 0) return value;
  const redactString = (s: string): string => {
    let out = s;
    for (const secret of nonEmpty) out = out.split(secret).join(REDACTION);
    return out;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return redactString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, item] of Object.entries(v)) out[k] = walk(item);
      return out;
    }
    return v;
  };
  return walk(value);
}
