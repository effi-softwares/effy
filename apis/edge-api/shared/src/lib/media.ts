// Direct-to-S3 presigned upload/read, shared by every cold-path service that stores images.
//
// Bytes never pass through Lambda: the service mints a presigned PUT url the client uploads to,
// records the object key, and mints short-lived presigned GET urls on read. The bucket is private;
// IAM (s3:PutObject/GetObject scoped to the bucket) is granted per-service in serverless.yml. The S3
// client is a cached module singleton (no DI framework; same pattern as the cached pg pool).
//
// ── ⚠ PROMOTED FROM apis/edge-api/shop/src/products/media.ts BY 028 ─────────────────────────────
//
// This was written for product media in 016 and lived inside the shop service. 028 needs the same
// thing for promotional banner artwork in the ADMIN service, and copying it there would be exactly
// the cross-cutting copy-paste Principle II prohibits — two files that agree about allowed content
// types and size ceilings today and drift apart the first time either is touched.
//
// Two things changed in the move, and only two:
//   1. The key PREFIX is a parameter (`products/…` vs `promotions/…`) instead of a literal.
//   2. It throws its OWN error type instead of shop's `ProductError`, so a shared helper does not
//      depend on one service's domain. Each caller maps [MediaValidationError] to its own error.
//
// Everything else — the allowed types, the ceiling, the TTLs, the collision-free key — is unchanged,
// deliberately: shop's existing media tests must pass against this without edits, and if they need
// editing then the extraction changed behaviour and is wrong.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (016 FR-026)

const UPLOAD_URL_TTL = 300; // 5 min — long enough to upload, short enough to not linger
const READ_URL_TTL = 900; // 15 min — a presigned GET for the operator management surface

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** A field-level validation problem, for the caller to map onto its own domain error. */
export interface MediaFieldIssue {
  field: string;
  message: string;
}

/**
 * A rejected upload declaration.
 *
 * ⚠ Deliberately NOT an HTTP concern and NOT any one service's domain error. The shared layer knows
 * what a bad image declaration looks like; it does not know how a given service reports one.
 */
export class MediaValidationError extends Error {
  readonly fields: MediaFieldIssue[];

  constructor(message: string, fields: MediaFieldIssue[]) {
    super(message);
    this.name = "MediaValidationError";
    this.fields = fields;
  }
}

export function isMediaValidationError(e: unknown): e is MediaValidationError {
  return e instanceof MediaValidationError;
}

let cached: S3Client | null = null;
function client(): S3Client {
  if (!cached) cached = new S3Client({});
  return cached;
}

function bucket(): string {
  const b = process.env.S3_MEDIA_BUCKET;
  if (!b) throw new Error("S3_MEDIA_BUCKET is not configured");
  return b;
}

/**
 * Validate a declared upload and mint a presigned PUT url + the object key it will live at.
 *
 * The key is `<prefix>/<ownerId>/<random>.<ext>` — a time-independent crypto token, so two uploads
 * never collide. Rejects a bad content-type or an oversize file with a [MediaValidationError].
 *
 * ⚠ The size check is a DECLARATION check, not a guarantee: a client states `fileSize` and S3 accepts
 * whatever it is actually sent. It exists to give an operator an immediate, field-level answer rather
 * than a failed upload, and the bucket's own limits remain the real ceiling.
 */
export async function presignUpload(
  prefix: string,
  ownerId: string,
  contentType: unknown,
  fileSize: unknown,
): Promise<{ uploadUrl: string; storageKey: string }> {
  if (typeof contentType !== "string" || !ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new MediaValidationError("unsupported image type", [
      { field: "contentType", message: "must be image/jpeg, image/png, or image/webp" },
    ]);
  }
  if (
    typeof fileSize !== "number" ||
    !Number.isFinite(fileSize) ||
    fileSize <= 0 ||
    fileSize > MAX_IMAGE_FILE_SIZE
  ) {
    throw new MediaValidationError("image too large", [
      { field: "fileSize", message: `must be a positive number up to ${MAX_IMAGE_FILE_SIZE} bytes` },
    ]);
  }
  const token = randomToken();
  const storageKey = `${prefix}/${ownerId}/${token}.${EXTENSION[contentType]}`;
  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: storageKey, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL },
  );
  return { uploadUrl, storageKey };
}

/** A short-lived presigned GET url for reading a stored object (list/detail responses). */
export async function presignRead(storageKey: string): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: storageKey }), {
    expiresIn: READ_URL_TTL,
  });
}

// crypto.randomUUID is available on the Lambda Node 22 runtime; avoids Math.random collisions.
function randomToken(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}
