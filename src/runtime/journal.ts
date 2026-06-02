// RefJournal — AGP reference implementation of the signed, hash-chained audit
// journal (JournalEvent contract). Events append as JSONL; each is hashed over
// `prevHash ‖ canonicalJson(event sans hash+signature)` and Ed25519-signed over
// the SAME canonical bytes the hash covers. verifyJournal re-derives both
// offline and detects any tampering or broken link.
//
// REFERENCE — the production journal (Epic 10, agp-qn7) hardens this (evidence
// bundles, key rotation) but MUST preserve the same canonical-bytes/verify rule.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { KeyObject } from "node:crypto";
import { JournalEvent } from "../contracts/journal-event.ts";
import type { Actor } from "../contracts/_common.ts";
import { canonicalJson, sha256Hex, signEd25519, verifyEd25519 } from "./crypto.ts";

export interface AppendInput {
  kind: string;
  actor: Actor;
  payload: Record<string, unknown>;
}

/** The event minus the fields derived during sealing (hash, signature). */
function canonicalBytes(eventSansHashSig: Record<string, unknown>, prevHash: string | null): string {
  return (prevHash ?? "") + canonicalJson(eventSansHashSig);
}

export function readEvents(path: string): JournalEvent[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line) => JournalEvent.parse(JSON.parse(line)));
}

export class RefJournal {
  private readonly path: string;
  private readonly privateKey: KeyObject;
  private readonly now: () => string;

  constructor(path: string, privateKey: KeyObject, now: () => string = () => new Date().toISOString()) {
    this.path = path;
    this.privateKey = privateKey;
    this.now = now;
  }

  /** Seal and append one event; returns the full sealed event. */
  append(input: AppendInput): JournalEvent {
    const existing = readEvents(this.path);
    const last = existing[existing.length - 1];
    const prevHash = last ? last.hash : null;
    const seq = (last?.seq ?? 0) + 1;

    const unsealed = {
      v: 2 as const,
      seq,
      ts: this.now(),
      prevHash,
      kind: input.kind,
      actor: input.actor,
      payload: input.payload,
      tenant_id: null,
      signing_key_id: null,
      approval_binding_type: null,
      sprite_identity_uri: null,
    };

    const bytes = canonicalBytes(unsealed, prevHash);
    const hash = sha256Hex(bytes);
    const signature = signEd25519(bytes, this.privateKey);

    const event = JournalEvent.parse({ ...unsealed, hash, signature });
    appendFileSync(this.path, JSON.stringify(event) + "\n");
    return event;
  }
}

export interface VerifyResult {
  ok: boolean;
  count: number;
  errors: string[];
}

/** Offline verification: re-derive each hash + signature and check the chain. */
export function verifyJournal(path: string, publicKey: KeyObject): VerifyResult {
  const errors: string[] = [];
  let events: JournalEvent[];
  try {
    events = readEvents(path);
  } catch (err) {
    return { ok: false, count: 0, errors: [`unreadable/invalid journal: ${(err as Error).message}`] };
  }

  let expectedPrev: string | null = null;
  let expectedSeq = 1;
  for (const ev of events) {
    const { hash, signature, ...rest } = ev;
    const bytes = canonicalBytes(rest, ev.prevHash);

    if (ev.seq !== expectedSeq) errors.push(`seq ${ev.seq}: expected ${expectedSeq}`);
    if (ev.prevHash !== expectedPrev) errors.push(`seq ${ev.seq}: prevHash does not link to prior event`);
    if (sha256Hex(bytes) !== hash) errors.push(`seq ${ev.seq}: hash mismatch (tampered payload)`);
    if (!verifyEd25519(bytes, signature, publicKey)) errors.push(`seq ${ev.seq}: signature invalid`);

    expectedPrev = ev.hash;
    expectedSeq += 1;
  }

  return { ok: errors.length === 0, count: events.length, errors };
}
