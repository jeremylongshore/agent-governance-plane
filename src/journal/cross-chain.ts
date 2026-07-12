// Cross-chain causal reconstruction (agp-eva.1.2 · 058-AT-ADR · iel-25a.4 Layer 1).
//
// The AGP side of the joint "what did the agent KNOW when it acted X?" query. One
// governed run writes two hash chains — the AGP journal here ("what it did") and the
// GSB receipt chain ("what it knew"). Each AGP action entry carries the shared
// `correlation_id` and the `gsb_receipt_tip_hash` observed at decision time. Given a
// correlation id, this returns the correlated actions and the GSB receipt tips each
// observed; a GSB audit then resolves those tips against its own hash-chained receipt
// store to recover the actual facts. Together the two chains reconstruct
// knowledge→action provenance — unanswerable without the pointer, and unrecoverable
// for any run recorded before the field existed (hence: born from the first commit).
//
// Pure over already-parsed events. Run `verifyJournalFile` first for tamper-evidence;
// this function trusts its input's integrity and only projects the causal view.

import type { JournalEvent } from "../contracts/journal-event.ts";

export interface ActionKnowledge {
  /** Journal sequence number of the action. */
  seq: number;
  /** Event kind, e.g. `tool_call.allow`. */
  kind: string;
  /** Event timestamp (ISO-8601). */
  ts: string;
  /**
   * The GSB receipt-chain tip observed when this action was decided — the pointer a
   * GSB audit resolves to recover "what it knew." Null if no brain read grounded it.
   */
  gsbReceiptTipHash: string | null;
}

export interface ReconstructedRun {
  correlationId: string;
  /** Every journal action correlated to this run, in chain order. */
  actions: ActionKnowledge[];
  /**
   * Distinct GSB receipt tips observed across the run, first-seen order — the "what
   * it knew" pointers a GSB `ico audit` resolves against its receipt chain.
   */
  gsbReceiptTips: string[];
}

/**
 * Reconstruct the knowledge context of one governed run from the AGP journal.
 *
 * Fail-closed on a malformed query: an empty `correlationId` is a caller bug, not a
 * run that "happened to record nothing" — throwing keeps it from silently masquerading
 * as an empty (and therefore falsely clean) reconstruction.
 */
export function reconstructKnowledgeAt(events: JournalEvent[], correlationId: string): ReconstructedRun {
  if (correlationId.length === 0) {
    throw new Error("reconstructKnowledgeAt: correlationId must be a non-empty id");
  }
  const actions: ActionKnowledge[] = [];
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
