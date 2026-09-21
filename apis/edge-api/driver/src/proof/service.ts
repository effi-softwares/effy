// Proof of delivery — validation, refusals and the presign (064).
//
// The service owns what a request MAY be; `repository.ts` owns what happens when it is. Keeping the
// refusals here means each one can be tested without a database, and the transaction stays readable.

import { MediaValidationError, PROOF_MEDIA_PREFIX, presignUpload } from "@effy/edge-shared";
import type { DropFailRequest, ProofPresignRequest, ProofRequest } from "@effy/shared-types";

import { DropNotFoundError, recordFailure, recordProof } from "./repository";
import type { RecordProofResult } from "./repository";
import { MEDIA_REQUIRED_METHODS, isSupportedMethod } from "./types";

/** A refusal the caller maps to a field-scoped 422. */
export class ProofValidationError extends Error {
  constructor(
    readonly field: string,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "ProofValidationError";
  }
}

export { DropNotFoundError };

/** The closed set of reasons a drop can fail (FR-009). Free text would be unreportable in aggregate. */
const FAILURE_REASONS = new Set([
  "nobody_home",
  "wrong_address",
  "customer_refused",
  "access_blocked",
  "other",
]);

/**
 * Mint a presigned PUT for a proof image.
 *
 * ⚠ THE PREFIX IS INFRASTRUCTURE, NOT A NAMING CHOICE. `PROOF_MEDIA_PREFIX` is the same constant the
 * Terraform lifecycle rule filters on; an object written anywhere else is never archived and sits in
 * STANDARD storage for ever, with nothing reporting it.
 */
export async function presignProof(
  dropId: string,
  body: ProofPresignRequest,
): Promise<{ uploadUrl: string; mediaKey: string }> {
  if (!body?.changeId) throw new ProofValidationError("changeId", "A changeId is required.");

  // Validation (content type, size ceiling) belongs to the shared helper — one definition of what the
  // platform will store, not one per service.
  const { uploadUrl, storageKey } = await presignUpload(
    PROOF_MEDIA_PREFIX,
    dropId,
    body.contentType,
    body.fileSize,
  );
  return { uploadUrl, mediaKey: storageKey };
}

export { MediaValidationError };

/**
 * Complete a drop with proof.
 *
 * ⚠ THE `code` REFUSAL IS THE POINT OF FR-003, NOT AN OVERSIGHT. `ProofMethod` still carries
 * `"code"` on the wire because the method is coming — narrowing the type would hide the deferral
 * instead of stating it. But no delivery code exists anywhere on this platform: `delivery_code`
 * appears in no service, migration, contract or app. Accepting a code would compare a value to
 * itself, which is a gate that LOOKS enforced and checks nothing. So it is refused, by name, with a
 * reason a person can read — and the database refuses it too (`delivery_proof_method_check`), so
 * neither half can drift into accepting it alone.
 */
export async function submitProof(
  dropId: string,
  driverId: string,
  driverSub: string,
  body: ProofRequest,
): Promise<RecordProofResult> {
  if (!body?.changeId) throw new ProofValidationError("changeId", "A changeId is required.");

  if (body.method === "code") {
    throw new ProofValidationError(
      "method",
      "Code proof is not available yet — no delivery code is issued for an order. " +
        "Use a photo, a signature, or contactless.",
    );
  }
  if (!isSupportedMethod(body.method)) {
    throw new ProofValidationError(
      "method",
      "Proof must be a photo, a signature, or contactless.",
    );
  }

  const mediaKey = body.mediaKey?.trim() || null;

  // ⚠ FR-006 IN THE SERVICE AS WELL AS THE SCHEMA, deliberately. The CHECK is the guarantee; this is
  // the message. A constraint violation reaching a driver as a 500 tells them nothing about what to
  // do, and "retake the photo" is exactly what they need to hear.
  if (MEDIA_REQUIRED_METHODS.includes(body.method) && mediaKey === null) {
    throw new ProofValidationError(
      "mediaKey",
      "That proof needs an image, and none was uploaded. Capture it again.",
    );
  }

  // ⚠ FR-002 — an unattended drop is the case most likely to become a dispute, so it is the one that
  // MUST carry a photograph. Contactless without media is representable in the schema (it is the one
  // legitimate no-media proof) and is refused here, where the rule belongs.
  if (body.method === "contactless" && mediaKey === null) {
    throw new ProofValidationError(
      "mediaKey",
      "A contactless delivery needs a photo of where the package was left.",
    );
  }

  return recordProof({
    dropId,
    driverId,
    driverSub,
    method: body.method,
    mediaKey,
    note: body.note?.trim() || null,
    changeId: body.changeId,
  });
}

/** Record a drop that could not be completed (FR-009, FR-010). */
export async function submitFailure(dropId: string, driverId: string, body: DropFailRequest) {
  if (!body?.changeId) throw new ProofValidationError("changeId", "A changeId is required.");
  if (!FAILURE_REASONS.has(body.reason as string)) {
    throw new ProofValidationError("reason", "That is not a reason a delivery can fail for.");
  }

  const note = body.note?.trim() || null;
  // ⚠ FR-010 — a free-text escape hatch with no text is an exception nobody can act on. Mirrors
  // `delivery_attempt_failure_other_note_check`, which also rejects whitespace.
  if (body.reason === "other" && note === null) {
    throw new ProofValidationError("note", "Tell us what happened, so someone can follow it up.");
  }

  return recordFailure({ dropId, driverId, reason: body.reason, note, changeId: body.changeId });
}
