import { GetObjectCommand, NoSuchKey, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import type { RenditionFailure, RenditionRepository } from "./repository";
import { isOriginalKey, renditionKey, widthsFor } from "./widths";

/** Larger pictures are refused, not decoded (decompression bombs). */
export const MAX_INPUT_PIXELS = 50_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const WEBP = { quality: 78, effort: 4 } as const;

export type RenderOutcome =
  | { kind: "ready"; widths: number[] }
  | { kind: "failed"; failure: RenditionFailure }
  | { kind: "refused" }
  | { kind: "gone" };

export interface RenderDeps {
  s3: Pick<S3Client, "send">;
  bucket: string;
  repo: RenditionRepository;
}

/**
 * A picture that cannot be resized is recorded and returned, not thrown: retrying a corrupt file
 * changes nothing, and `RenditionFailed` alarms. Platform faults are thrown so the queue retries.
 */
export async function render(key: string, deps: RenderDeps): Promise<RenderOutcome> {
  if (!isOriginalKey(key)) return { kind: "refused" };

  let original: Buffer;
  try {
    const res = await deps.s3.send(new GetObjectCommand({ Bucket: deps.bucket, Key: key }));
    original = Buffer.from((await res.Body?.transformToByteArray()) ?? []);
  } catch (err) {
    if (err instanceof NoSuchKey || (err as { name?: string }).name === "NoSuchKey") return { kind: "gone" };
    throw err;
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch (err) {
    const failure: RenditionFailure = /pixel limit/i.test(String((err as Error).message)) ? "too_large" : "corrupt";
    await deps.repo.recordFailed(key, failure);
    return { kind: "failed", failure };
  }

  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    await deps.repo.recordFailed(key, "unsupported", meta.width ?? null, meta.height ?? null);
    return { kind: "failed", failure: "unsupported" };
  }
  if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_INPUT_PIXELS) {
    await deps.repo.recordFailed(key, "too_large", meta.width ?? null, meta.height ?? null);
    return { kind: "failed", failure: "too_large" };
  }

  // Exif orientation 5–8 swaps the axes: the width a viewer sees is the stored height.
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;

  // An animation would be cut to its first frame, so the original is served instead.
  if ((meta.pages ?? 1) > 1) {
    await deps.repo.recordReady(key, [], width, height);
    return { kind: "ready", widths: [] };
  }

  const widths = widthsFor(width);
  try {
    for (const w of widths) {
      const body = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp(WEBP)
        .toBuffer();
      await deps.s3.send(
        new PutObjectCommand({ Bucket: deps.bucket, Key: renditionKey(key, w), Body: body, ContentType: "image/webp" }),
      );
    }
  } catch (err) {
    // A decode failure part-way through is the picture's fault; an S3 failure is ours.
    if ((err as { $metadata?: unknown }).$metadata) throw err;
    await deps.repo.recordFailed(key, "corrupt", width, height);
    return { kind: "failed", failure: "corrupt" };
  }

  await deps.repo.recordReady(key, widths, width, height);
  return { kind: "ready", widths };
}
