// INTERNAL — unstable — no public RFC.
//
// Shared primitives for the AGP core contracts. These schemas are AGP-internal
// and aligned with the CCSC kernel (which uses zod) that AGP vendors per ADR
// 009. Breaking changes to any core contract require a Bead + an ADR — see each
// contract's 000-docs/0NN-AT-CONT-*.md "Stability" section.

import { z } from "zod";

/** Stability marker stamped in every contract module's header comment. */
export const CONTRACT_STABILITY = "INTERNAL — unstable — no public RFC" as const;

/** SHA-256 as 64 lowercase hex chars (journal hash / prevHash). */
export const Sha256Hex = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex chars (sha256)");

/** Ed25519 signature, base64 of a 64-byte signature (88 chars incl. padding). */
export const Ed25519SignatureB64 = z
  .string()
  .regex(/^[A-Za-z0-9+/]{86}==$/, "must be base64-encoded 64-byte Ed25519 (88 chars)");

/** RFC 3339 / ISO-8601 timestamp. */
export const IsoTimestamp = z.string().datetime({ offset: true });

/**
 * The only actors AGP's policy engine may trust. Mirrors CCSC: a tool call is
 * attributable either to the human session owner or to the agent process.
 */
export const Actor = z.enum(["session_owner", "claude_process"]);
export type Actor = z.infer<typeof Actor>;
