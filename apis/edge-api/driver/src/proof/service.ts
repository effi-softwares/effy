// What a request may be; `repository.ts` owns what then happens.

import { MediaValidationError, PROOF_MEDIA_PREFIX, presignUpload, query } from "@effy/edge-shared";
import type { DropFailRequest, ProofPresignRequest, ProofRequest } from "@effy/shared-types";

import { assertStopRoundOpen } from "../work/open";
import { DropNotFoundError, recordFailure, recordProof } from "./repository";
import type { RecordProofResult } from "./repository";
import { MEDIA_REQUIRED_METHODS, isSupportedMethod } from "./types";

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

/** A closed set, so failures can be reported in aggregate. */
const FAILURE_REASONS = new Set([
  "nobody_home",
  "wrong_address",
  "customer_refused",
  "access_blocked",
  "other",
]);

/** `PROOF_MEDIA_PREFIX` is the prefix the Terraform lifecycle rule archives. */
export async function presignProof(
  dropId: string,
  driverId: string,
  body: ProofPresignRequest,
): Promise<{ uploadUrl: string; mediaKey: string }> {
  if (!body?.changeId) throw new ProofValidationError("changeId", "A changeId is required.");

  // No upload slot before the round opens. Scoped to the driver, so another's drop reveals nothing.
  await assertStopRoundOpen({ query: (text, values) => query(text, values) }, dropId, driverId);

  // The shared helper validates type and size.
  const { uploadUrl, storageKey } = await presignUpload(
    PROOF_MEDIA_PREFIX,
    dropId,
    body.contentType,
    body.fileSize,
  );
  return { uploadUrl, mediaKey: storageKey };
}

export { MediaValidationError };

/** `code` is refused by name (and by `delivery_proof_method_check`): no delivery code exists. */
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

  // Mirrors the check so the driver hears "retake the photo", not a 500.
  if (MEDIA_REQUIRED_METHODS.includes(body.method) && mediaKey === null) {
    throw new ProofValidationError(
      "mediaKey",
      "That proof needs an image, and none was uploaded. Capture it again.",
    );
  }

  // An unattended drop must carry a photograph.
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
    parcels: body.parcels,
    missingParcels: body.missingParcels,
    reads: body.reads,
  });
}

export async function submitFailure(dropId: string, driverId: string, body: DropFailRequest) {
  if (!body?.changeId) throw new ProofValidationError("changeId", "A changeId is required.");
  if (!FAILURE_REASONS.has(body.reason as string)) {
    throw new ProofValidationError("reason", "That is not a reason a delivery can fail for.");
  }

  const note = body.note?.trim() || null;
  // "Other" needs a note (whitespace is not one), as `delivery_attempt_failure_other_note_check`.
  if (body.reason === "other" && note === null) {
    throw new ProofValidationError("note", "Tell us what happened, so someone can follow it up.");
  }

  return recordFailure({ dropId, driverId, reason: body.reason, note, changeId: body.changeId });
}
