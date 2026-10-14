// The queue's consumer: one uploaded picture per invocation (086). Fed by the bucket's upload
// notifications, and by the backfill, which sends the same shape.
import { S3Client } from "@aws-sdk/client-s3";
import { emitMetric, logger, metricNamespace } from "@effy/edge-shared";
import type { SQSEvent } from "aws-lambda";

import { createRenditionRepository } from "../render/repository";
import { render } from "../render/service";

let s3: S3Client | undefined;
const repo = createRenditionRepository();

function bucket(): string {
  const b = process.env.S3_MEDIA_BUCKET;
  if (!b) throw new Error("S3_MEDIA_BUCKET is not configured");
  return b;
}

/** The object keys an S3 event body names. S3's own test message names none. */
export function keysOf(body: string): string[] {
  const parsed = JSON.parse(body) as { Event?: string; Records?: { s3?: { object?: { key?: string } } }[] };
  if (parsed.Event === "s3:TestEvent") return [];
  return (parsed.Records ?? [])
    .map((r) => r.s3?.object?.key)
    .filter((k): k is string => typeof k === "string")
    // S3 encodes the key in its events, with "+" for a space.
    .map((k) => decodeURIComponent(k.replace(/\+/g, " ")));
}

export const handler = async (event: SQSEvent): Promise<void> => {
  s3 ??= new S3Client({});
  for (const record of event.Records) {
    for (const key of keysOf(record.body)) {
      const started = Date.now();
      // ⚠ A thrown error leaves the message on the queue: it is retried, then dead-lettered (alarmed).
      const outcome = await render(key, { s3, bucket: bucket(), repo });
      const ms = Date.now() - started;
      if (outcome.kind === "ready") {
        emitMetric(metricNamespace(), "RenditionsCreated", 1);
        logger.info({ key, widths: outcome.widths, ms }, "media: copies made");
      } else if (outcome.kind === "failed") {
        // ⚠ No dimension: the alarm watches the bare metric (any failure pages, FR-020). The reason
        // is in this log line and in the row.
        emitMetric(metricNamespace(), "RenditionFailed", 1);
        logger.warn({ key, failure: outcome.failure, ms }, "media: picture could not be made smaller");
      } else {
        logger.info({ key, outcome: outcome.kind }, "media: nothing to do");
      }
    }
  }
};
