// Direct-to-S3 presigned upload and read for every service that stores images. Bytes never pass
// through Lambda: a presigned PUT for upload, short-lived presigned GETs for reads. The key prefix is a
// parameter, and validation throws `MediaValidationError` for each caller to map.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

const UPLOAD_URL_TTL = 300;
const READ_URL_TTL = 900;

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** For the caller to map onto its own domain error. */
export interface MediaFieldIssue {
  field: string;
  message: string;
}

/** Neither HTTP nor any one service's domain. */
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
 * A presigned PUT and the key `<prefix>/<ownerId>/<random>.<ext>`. The size check is on the declared
 * `fileSize`, for a fast field-level answer; S3's limits remain the real ceiling.
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

/** The courier's PDF, or an image of it. */
const LABEL_CONTENT_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/png": "png" };
const MAX_LABEL_FILE_SIZE = 5 * 1024 * 1024;

/** Under `courier-label/<packageId>/`. Never public: it carries the customer's name and address. */
export async function presignLabelUpload(
  packageId: string,
  contentType: unknown,
  fileSize: unknown,
): Promise<{ uploadUrl: string; storageKey: string; contentType: string }> {
  if (typeof contentType !== "string" || !LABEL_CONTENT_TYPES[contentType]) {
    throw new MediaValidationError("unsupported label type", [{ field: "contentType", message: "must be application/pdf or image/png" }]);
  }
  if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_LABEL_FILE_SIZE) {
    throw new MediaValidationError("label too large", [{ field: "fileSize", message: `must be a positive number up to ${MAX_LABEL_FILE_SIZE} bytes` }]);
  }
  const storageKey = `courier-label/${packageId}/${randomToken()}.${LABEL_CONTENT_TYPES[contentType]}`;
  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: storageKey, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL },
  );
  return { uploadUrl, storageKey, contentType };
}

/** The leading bytes of a stored object: the only way to know what a presigned PUT actually uploaded. */
export async function readObjectPrefix(storageKey: string, bytes: number): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: storageKey, Range: `bytes=0-${bytes - 1}` }),
  );
  const body = await res.Body?.transformToByteArray();
  if (!body) throw new Error(`media: could not read ${storageKey}`);
  return Buffer.from(body);
}

/** For list and detail responses. */
export async function presignRead(storageKey: string): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: storageKey }), {
    expiresIn: READ_URL_TTL,
  });
}

/**
 * A presigned read URL, or null (no key, or cannot sign); never fails the read around it. The private
 * reader for courier labels; never turn it into a public builder.
 */
export async function imageUrlOrNull(storageKey: string | null | undefined): Promise<string | null> {
  if (!storageKey) return null;
  try {
    return await presignRead(storageKey);
  } catch {
    return null;
  }
}

// crypto.randomUUID avoids Math.random collisions.
function randomToken(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}
