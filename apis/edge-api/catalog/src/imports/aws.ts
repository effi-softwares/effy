// The import worker's two outward calls: its queue, and the media bucket's private staging prefix.
// Module singletons, wired here and nowhere else; tests replace this module.

import { CopyObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

let s3: S3Client | undefined;
let sqs: SQSClient | undefined;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export type ImportStep = "check" | "create";

/** One message per step; the worker reads the import's own state, so a duplicate does nothing. */
export async function enqueue(importId: string, step: ImportStep): Promise<void> {
  sqs ??= new SQSClient({});
  await sqs.send(new SendMessageCommand({ QueueUrl: env("PRODUCT_IMPORT_QUEUE_URL"), MessageBody: JSON.stringify({ importId, step }) }));
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** A fetched picture waits under imports/ (private, never notified) until its product exists. */
export async function stagePicture(importId: string, rowNumber: number, n: number, bytes: Buffer, contentType: keyof typeof EXT): Promise<string> {
  s3 ??= new S3Client({});
  const key = `imports/${importId}/${rowNumber}/${n}.${EXT[contentType]}`;
  await s3.send(new PutObjectCommand({ Bucket: env("S3_MEDIA_BUCKET"), Key: key, Body: bytes, ContentType: contentType }));
  return key;
}

/** Into the product's own folder: the bucket's notification then makes its smaller copies (086). */
export async function promotePicture(stagedKey: string, productId: string): Promise<string> {
  s3 ??= new S3Client({});
  const bucket = env("S3_MEDIA_BUCKET");
  const name = stagedKey.split("/").slice(2).join("-");
  const key = `products/${productId}/${name}`;
  await s3.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${encodeURI(stagedKey)}`, Key: key }));
  return key;
}
