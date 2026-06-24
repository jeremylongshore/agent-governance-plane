// Egress policy — the opt-in selector + model-host allowlist for the sandbox's
// outbound network posture. PURE config: parse + validate only; it wires NO
// enforcement. The enforcement (egress-allowlist proxy + internal Docker
// network) lands in agp-3s4.3 and the live spawn-gate in agp-3s4.4.
//
// Three modes, mapping onto the existing --network posture:
//   - "none"      — no egress (today's default-deny, --network none).
//   - "full"      — unrestricted egress (Topology B, --network bridge).
//   - "allowlist" — model-API-only egress (Topology C). Requires a host
//                   allowlist; enforcement is gated until agp-3s4.3, so the
//                   sandbox fails CLOSED when it is selected before then.
//
// Opt-in via $AGP_SANDBOX_EGRESS (+ $AGP_SANDBOX_EGRESS_ALLOWLIST for the host
// list). Absent ⇒ undefined ⇒ the caller keeps its legacy networkEnabled
// behavior byte-for-byte. Invalid ⇒ throw (fail closed).
//
// Design: 000-docs/049-AT-ADR-topology-c-egress-allowlist-design sections 1, 3.

export type EgressMode = "none" | "full" | "allowlist";

export interface EgressPolicy {
  mode: EgressMode;
  /** Model-API hosts permitted under "allowlist" mode. Empty for none/full. */
  allowlist: string[];
}

const VALID_MODES: readonly EgressMode[] = ["none", "full", "allowlist"];

// A conservative bare-hostname check: dot-separated labels of [A-Za-z0-9-], each
// 1–63 chars, no leading/trailing hyphen, and no scheme/port/path/whitespace.
// The allowlist is by HOST not IP (049 section 1: stable vs dynamic CDN IPs).
const HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

function isPlausibleHost(host: string): boolean {
  if (host.includes("/") || host.includes(":") || /\s/.test(host)) return false;
  // Reject a bare IPv4 address: 049 §1 allowlists by HOST not IP (CDN IPs rotate),
  // and the egress proxy in agp-3s4.3 will match by SNI/hostname. The HOSTNAME
  // regex alone treats "1.2.3.4" as four single-char labels, so guard explicitly.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return HOSTNAME.test(host);
}

/** Parse a comma/whitespace-separated host list. Throws if any token is not a plausible host. */
export function parseModelAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  const hosts = raw
    .split(/[,\s]+/)
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
  for (const h of hosts) {
    if (!isPlausibleHost(h)) {
      throw new Error(`invalid egress allowlist host '${h}' (expected a bare hostname — no scheme, port, or path)`);
    }
  }
  return hosts;
}

/** Parse the egress mode token. Returns undefined when unset/empty; throws on an unknown value (fail closed). */
export function parseEgressMode(raw: string | undefined): EgressMode | undefined {
  if (raw === undefined) return undefined;
  const mode = raw.trim().toLowerCase();
  if (mode.length === 0) return undefined;
  if (!VALID_MODES.includes(mode as EgressMode)) {
    throw new Error(`invalid AGP_SANDBOX_EGRESS '${raw}' (expected one of: ${VALID_MODES.join(", ")})`);
  }
  return mode as EgressMode;
}

/**
 * Resolve the egress policy from the environment. Returns undefined when the
 * operator has not opted in ($AGP_SANDBOX_EGRESS unset/empty) — the caller then
 * keeps its legacy networkEnabled behavior unchanged. Throws (fail closed) on
 * any invalid/inconsistent config: an unknown mode, "allowlist" with no hosts,
 * or a malformed host.
 */
export function resolveEgressPolicy(env: Record<string, string | undefined> = process.env): EgressPolicy | undefined {
  const mode = parseEgressMode(env.AGP_SANDBOX_EGRESS);
  if (mode === undefined) return undefined;
  const allowlist = parseModelAllowlist(env.AGP_SANDBOX_EGRESS_ALLOWLIST);
  if (mode === "allowlist" && allowlist.length === 0) {
    throw new Error(
      "AGP_SANDBOX_EGRESS=allowlist requires AGP_SANDBOX_EGRESS_ALLOWLIST (the model host(s)) — refusing an empty allowlist",
    );
  }
  return { mode, allowlist };
}
