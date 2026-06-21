// Journal — AGP's production signed audit journal (the hardened successor to the
// Epic 04 RefJournal). Events append as JSONL; each is hashed over
// `prevHash ‖ canonicalJson(event sans hash+signature)` and Ed25519-signed over
// the same bytes. Adapted from CCSC journal.ts (v2 signed events).
//
// Hardening over the reference: every append also rewrites a SIGNED HEAD
// CHECKPOINT (`<journal>.head`) recording the latest {seq, hash}. The hash chain
// alone cannot detect truncation (a shorter valid chain still verifies); the
// signed head pins the expected tail so the offline verifier catches it.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { KeyObject } from "node:crypto";
import { JournalEvent } from "../contracts/journal-event.ts";
import type { Actor } from "../contracts/_common.ts";
import { canonicalJson, sha256Hex, signEd25519 } from "../runtime/crypto.ts";

export interface AppendInput {
  kind: string;
  actor: Actor;
  payload: Record<string, unknown>;
  /**
   * Verified intendant identity URI for this event (agp-z26 / 043-AT-ADR). The
   * locked top-level column — distinct from anything in `payload`. Null when
   * provenance is unasserted (v0 default); populated once a verifier mints a URI.
   */
  intendant_identity_uri?: string | null;
}

export interface HeadCheckpoint {
  seq: number;
  hash: string;
  signature: string;
}

export function headPath(journalPath: string): string {
  return journalPath + ".head";
}

/** Canonical bytes covered by an event's hash + signature. */
export function eventCanonicalBytes(eventSansHashSig: Record<string, unknown>, prevHash: string | null): string {
  return (prevHash ?? "") + canonicalJson(eventSansHashSig);
}

/** Canonical bytes the head checkpoint signs. */
export function headCanonicalBytes(seq: number, hash: string): string {
  return canonicalJson({ seq, hash });
}

export function readEvents(path: string): JournalEvent[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line) => JournalEvent.parse(JSON.parse(line)));
}

export function readHead(journalPath: string): HeadCheckpoint | null {
  const hp = headPath(journalPath);
  if (!existsSync(hp)) return null;
  return JSON.parse(readFileSync(hp, "utf8")) as HeadCheckpoint;
}

export class Journal {
  private readonly path: string;
  private readonly privateKey: KeyObject;
  private readonly now: () => string;
  private readonly screen?: (event: JournalEvent) => void;

  /**
   * @param screen optional fail-closed pre-write guard. Runs on the sealed event
   *   just before it is written; if it throws (e.g. a secret value would be
   *   recorded), the append throws and NOTHING is written — not the event, not the
   *   head. Wire `assertNoSecretValues` here so a credential can never reach the
   *   permanent signed journal (including the live path's verbatim tool args).
   */
  constructor(
    path: string,
    privateKey: KeyObject,
    now: () => string = () => new Date().toISOString(),
    screen?: (event: JournalEvent) => void,
  ) {
    this.path = path;
    this.privateKey = privateKey;
    this.now = now;
    this.screen = screen;
  }

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
      intendant_identity_uri: input.intendant_identity_uri ?? null,
    };

    const bytes = eventCanonicalBytes(unsealed, prevHash);
    const hash = sha256Hex(bytes);
    const signature = signEd25519(bytes, this.privateKey);
    const event = JournalEvent.parse({ ...unsealed, hash, signature });

    // Fail-closed boundary: if the guard rejects (e.g. a secret value would be
    // recorded), throw BEFORE any write — neither the event nor the head lands.
    this.screen?.(event);

    appendFileSync(this.path, JSON.stringify(event) + "\n");
    this.writeHead(seq, hash);
    return event;
  }

  /** Rewrite the signed head checkpoint to pin the current tail. */
  private writeHead(seq: number, hash: string): void {
    const signature = signEd25519(headCanonicalBytes(seq, hash), this.privateKey);
    const head: HeadCheckpoint = { seq, hash, signature };
    writeFileSync(headPath(this.path), JSON.stringify(head) + "\n");
  }
}
