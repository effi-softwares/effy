// Product media (016, research R9): direct-to-S3 presigned upload/read. Bytes never pass through
// Lambda — the service mints a presigned PUT url the client uploads to, records the object key, and
// mints short-lived presigned GET urls on read. The bucket is private; IAM (s3:PutObject/GetObject
// scoped to the bucket) is granted in serverless.yml. The S3 client is a cached module singleton
// (no DI framework; same pattern as the cached pg pool).
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { ProductError } from "./types";

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (FR-026)
const UPLOAD_URL_TTL = 300; // 5 min — long enough to upload, short enough to not linger
const READ_URL_TTL = 900; // 15 min — a presigned GET for the operator management surface

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

/** Validate a declared upload and mint a presigned PUT url + the object key it will live at.
 *  A pseudo-random key is derived from the product id + a time-independent token (crypto), so two
 *  uploads never collide. Rejects a bad content-type / oversize with a domain validation error. */
export async function presignUpload(
  productId: string,
  contentType: unknown,
  fileSize: unknown,
): Promise<{ uploadUrl: string; storageKey: string }> {
  if (typeof contentType !== "string" || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ProductError("validation", "unsupported image type", [
      { field: "contentType", message: "must be image/jpeg, image/png, or image/webp" },
    ]);
  }
  if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    throw new ProductError("validation", "image too large", [
      { field: "fileSize", message: `must be a positive number up to ${MAX_FILE_SIZE} bytes` },
    ]);
  }
  const token = randomToken();
  const storageKey = `products/${productId}/${token}.${EXTENSION[contentType]}`;
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
