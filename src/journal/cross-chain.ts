// Cross-chain governance-tip projection (agp-eva.1.2 · 058-AT-ADR).
//
// Each AGP action entry can carry a shared `correlation_id` and the Bob's Big Brain
// global governance-receipt tip observed at decision time. Given a correlation id,
// this returns the correlated actions and those tip hashes. The Registrar can resolve
// each hash to a position in its `audit_events` chain.
//
// This does NOT reconstruct the exact `qmd://` result set an agent read and does not
// prove that a brain result caused an action. That requires a separate content-safe,
// per-query read-set receipt (Registrar bead qmd-team-intent-kb-sdg).
//
// Pure over already-parsed events. Run `verifyJournalFile` first for tamper-evidence;
// this function trusts its input's integrity and only projects the causal view.

import type { JournalEvent } from "../contracts/journal-event.ts";

export interface ActionGovernanceTip {
  /** Journal sequence number of the action. */
  seq: number;
  /** Event kind, e.g. `tool_call.allow`. */
  kind: string;
  /** Event timestamp (ISO-8601). */
  ts: string;
  /**
   * The global brain governance-chain tip observed when this action was decided.
   * Null when no tip was stamped. This identifies chain position, not search results.
   */
  gsbReceiptTipHash: string | null;
}

export interface GovernanceTipProjection {
  correlationId: string;
  /** Every journal action correlated to this run, in chain order. */
  actions: ActionGovernanceTip[];
  /**
   * Distinct governance-receipt tips observed across the run, in first-seen order.
   */
  gsbReceiptTips: string[];
}

/**
 * Project the governance-chain tips stamped into one governed run's AGP events.
 *
 * Fail-closed on a malformed query: an empty or blank `correlationId` is a caller bug,
 * not a run that "happened to record nothing" — throwing keeps it from silently
 * masquerading as an empty (and therefore falsely clean) reconstruction. A
 * whitespace-only id is treated as blank because no minted id (`056-AT-CONT`) is blank,
 * so it can only be a malformed query.
 */
export function reconstructGovernanceTipsAt(
  events: JournalEvent[],
  correlationId: string,
): GovernanceTipProjection {
  if (correlationId.trim().length === 0) {
    throw new Error("reconstructGovernanceTipsAt: correlationId must be a non-empty, non-blank id");
  }
  const actions: ActionGovernanceTip[] = [];
  const gsbReceiptTips: string[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.correlation_id !== correlationId) continue;
    actions.push({ seq: ev.seq, kind: ev.kind, ts: ev.ts, gsbReceiptTipHash: ev.gsb_receipt_tip_hash });
    const tip = ev.gsb_receipt_tip_hash;
    if (tip !== null && !seen.has(tip)) {
      seen.add(tip);
      gsbReceiptTips.push(tip);
    }
  }
  return { correlationId, actions, gsbReceiptTips };
}

/** @deprecated Use `reconstructGovernanceTipsAt`; this alias does not reconstruct knowledge. */
export const reconstructKnowledgeAt = reconstructGovernanceTipsAt;

/** @deprecated Use `ActionGovernanceTip`. */
export type ActionKnowledge = ActionGovernanceTip;

/** @deprecated Use `GovernanceTipProjection`. */
export type ReconstructedRun = GovernanceTipProjection;
