// Row shapes and domain shapes for proof and failed attempts (064).
//
// ⚠ ROWS ARE MAPPED EXPLICITLY AND NEVER LEAK PAST THE DATA LAYER (Principle VI). A `pg` row is
// `snake_case`, stringly-typed and shaped by whatever the query happened to select; the wire DTO is
// the contract. Letting one stand in for the other is how a column rename becomes a silent API
// change.

import type { ProofMethod } from "@effy/shared-types";

/** The methods THIS SLICE ships. ⚠ Narrower than the wire's `ProofMethod`, which still carries
 *  `"code"` — the type is the eventual shape, the refusal is behaviour (research R4). */
export type SupportedProofMethod = Extract<ProofMethod, "photo" | "signature" | "contactless">;

export const SUPPORTED_PROOF_METHODS: readonly SupportedProofMethod[] = [
  "photo",
  "signature",
  "contactless",
] as const;

/** Methods that cannot be completed without an image (FR-002, FR-006). */
export const MEDIA_REQUIRED_METHODS: readonly SupportedProofMethod[] = ["photo", "signature"] as const;

export function isSupportedMethod(v: unknown): v is SupportedProofMethod {
  return typeof v === "string" && (SUPPORTED_PROOF_METHODS as readonly string[]).includes(v);
}

export interface DropRow {
  stop_id: string;
  stop_status: "pending" | "arrived" | "done" | "skipped";
  order_id: string | null;
  round_id: string;
  round_kind: "collection" | "delivery";
}

export interface ProofRow {
  id: string;
  stop_id?: string;
  method: SupportedProofMethod;
  media_key: string | null;
  note: string | null;
  captured_at: Date | string;
}

export interface FailureRow {
  id: string;
  stop_id?: string;
  reason: string;
  note: string | null;
  failed_at: Date | string;
}

export interface DropPackageRow {
  round_package_id: string;
  shop_fulfillment_id: string;
}

/** A completed proof, as the service hands it back. */
export interface CapturedProof {
  proofId: string;
  method: SupportedProofMethod;
  mediaKey: string | null;
  note: string | null;
  capturedAt: string;
}

export function toCapturedProof(row: ProofRow): CapturedProof {
  return {
    proofId: row.id,
    method: row.method,
    mediaKey: row.media_key,
    note: row.note,
    capturedAt: toIso(row.captured_at),
  };
}

/** ⚠ `pg` returns a `Date` for timestamptz; the wire carries ISO 8601 strings. Converting at the
 *  boundary rather than at each call site is what keeps the two from being confused. */
export function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}
