// Standalone offline verifier. Given a journal file and a PUBLIC key (no private
// key needed — true third-party verification), it re-derives every hash and
// signature, checks the chain links, and checks the signed head checkpoint.
//
// Catches: edit (hash mismatch), insertion / reorder (broken seq+prevHash),
// invalid signature, signed→unsigned rollback (a v1/unsigned line fails the
// v2-only contract parse), and truncation/extension (tail ≠ signed head).

import { existsSync, readFileSync } from "node:fs";
import type { KeyObject } from "node:crypto";
import { JournalEvent } from "../contracts/journal-event.ts";
import { sha256Hex, verifyEd25519 } from "../runtime/crypto.ts";
import { eventCanonicalBytes, headCanonicalBytes, readHead } from "./journal.ts";

export interface VerifyResult {
  ok: boolean;
  count: number;
  errors: string[];
}

/** Chain + signature checks over already-parsed events. */
export function verifyEvents(events: JournalEvent[], publicKey: KeyObject): string[] {
  const errors: string[] = [];
  let expectedPrev: string | null = null;
  let expectedSeq = 1;
  for (const ev of events) {
    const { hash, signature, ...rest } = ev;
    const bytes = eventCanonicalBytes(rest, ev.prevHash);
    if (ev.seq !== expectedSeq) errors.push(`seq ${ev.seq}: expected ${expectedSeq} (insertion or reorder)`);
    if (ev.prevHash !== expectedPrev) errors.push(`seq ${ev.seq}: prevHash does not link to the prior event`);
    if (sha256Hex(bytes) !== hash) errors.push(`seq ${ev.seq}: hash mismatch (edited payload)`);
    if (!verifyEd25519(bytes, signature, publicKey)) errors.push(`seq ${ev.seq}: signature invalid`);
    expectedPrev = ev.hash;
    expectedSeq += 1;
  }
  return errors;
}

/** Full offline verification of a journal file + its signed head checkpoint. */
export function verifyJournalFile(journalPath: string, publicKey: KeyObject): VerifyResult {
  const errors: string[] = [];

  if (!existsSync(journalPath)) {
    return { ok: false, count: 0, errors: [`journal not found at ${journalPath}`] };
  }

  // Defensive, line-by-line parse so a downgraded/unsigned (v1) or malformed
  // event is reported rather than aborting the whole verification.
  const events: JournalEvent[] = [];
  const lines = readFileSync(journalPath, "utf8").split("\n").filter((l) => l.trim().length > 0);
  lines.forEach((line, i) => {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      errors.push(`line ${i + 1}: not valid JSON`);
      return;
    }
    const parsed = JournalEvent.safeParse(json);
    if (!parsed.success) {
      errors.push(`line ${i + 1}: invalid or unsigned event (possible signed→unsigned rollback)`);
      return;
    }
    events.push(parsed.data);
  });

  errors.push(...verifyEvents(events, publicKey));

  // Truncation / extension: the signed head pins the expected tail.
  const head = readHead(journalPath);
  if (!head) {
    errors.push("no signed head checkpoint — truncation cannot be ruled out");
  } else if (!verifyEd25519(headCanonicalBytes(head.seq, head.hash), head.signature, publicKey)) {
    errors.push("head checkpoint signature invalid");
  } else {
    const last = events[events.length - 1];
    if (!last) {
      errors.push("signed head exists but journal is empty (truncated)");
    } else if (last.seq !== head.seq || last.hash !== head.hash) {
      errors.push(
        `journal tail (seq ${last.seq}) does not match the signed head (seq ${head.seq}) — truncation or extension`,
      );
    }
  }

  return { ok: errors.length === 0, count: events.length, errors };
}
