import type { ProofMethod } from "@effy/shared-types";

/** Narrower than the wire's `ProofMethod`, which still carries `"code"`. */
export type SupportedProofMethod = Extract<ProofMethod, "photo" | "signature" | "contactless">;

export const SUPPORTED_PROOF_METHODS: readonly SupportedProofMethod[] = [
  "photo",
  "signature",
  "contactless",
] as const;

export const MEDIA_REQUIRED_METHODS: readonly SupportedProofMethod[] = ["photo", "signature"] as const;

export function isSupportedMethod(v: unknown): v is SupportedProofMethod {
  return typeof v === "string" && (SUPPORTED_PROOF_METHODS as readonly string[]).includes(v);
}

export interface DropRow {
  stop_id: string;
  stop_status: "pending" | "out_for_delivery" | "en_route" | "arrived" | "done" | "skipped";
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

/** `pg` returns a Date for timestamptz; converted to ISO 8601 at the boundary. */
export function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}
