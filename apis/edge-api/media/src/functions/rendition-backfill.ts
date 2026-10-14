// OPERATOR — queue every existing picture that has no copies yet (086 FR-011). Safe to re-run: a
// picture with a ready row is skipped, and rendering the same picture twice writes the same files.
//
//   npx serverless invoke -f renditionBackfill --stage dev [--data '{"retryFailed": true, "prefix": "products/"}']
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import { logger } from "@effy/edge-shared";

import { createRenditionRepository, type RenditionRepository } from "../render/repository";
import { ORIGINAL_PREFIXES } from "../render/widths";

const PICTURE = /\.(jpe?g|png|webp)$/i;

export interface BackfillInput {
  retryFailed?: boolean;
  /** One of the original prefixes; both when absent. */
  prefix?: string;
}

export interface BackfillResult {
  listed: number;
  alreadyReady: number;
  skippedFailed: number;
  queued: number;
}

export interface BackfillDeps {
  s3: Pick<S3Client, "send">;
  sqs: Pick<SQSClient, "send">;
  bucket: string;
  queueUrl: string;
  repo: Pick<RenditionRepository, "knownKeys">;
}

/** The body S3 itself sends for an upload — so `render` reads one shape, whoever sent it. */
const s3EventBody = (key: string) =>
  JSON.stringify({ Records: [{ eventSource: "aws:s3", s3: { object: { key: encodeURIComponent(key).replace(/%2F/g, "/").replace(/%20/g, "+") } } }] });

export async function backfill(input: BackfillInput, deps: BackfillDeps): Promise<BackfillResult> {
  const prefixes = input.prefix ? ORIGINAL_PREFIXES.filter((p) => p === input.prefix) : [...ORIGINAL_PREFIXES];
  if (prefixes.length === 0) throw new Error(`prefix must be one of ${ORIGINAL_PREFIXES.join(", ")}`);

  const result: BackfillResult = { listed: 0, alreadyReady: 0, skippedFailed: 0, queued: 0 };
  for (const prefix of prefixes) {
    const known = await deps.repo.knownKeys(prefix);
    let token: string | undefined;
    do {
      const page = await deps.s3.send(new ListObjectsV2Command({ Bucket: deps.bucket, Prefix: prefix, ContinuationToken: token }));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      const todo: string[] = [];
      for (const { Key } of page.Contents ?? []) {
        if (!Key || !PICTURE.test(Key)) continue;
        result.listed += 1;
        if (known.ready.has(Key)) result.alreadyReady += 1;
        else if (known.failed.has(Key) && !input.retryFailed) result.skippedFailed += 1;
        else todo.push(Key);
      }
      for (let i = 0; i < todo.length; i += 10) {
        const batch = todo.slice(i, i + 10);
        const sent = await deps.sqs.send(
          new SendMessageBatchCommand({
            QueueUrl: deps.queueUrl,
            Entries: batch.map((key, n) => ({ Id: String(n), MessageBody: s3EventBody(key) })),
          }),
        );
        if (sent.Failed?.length) throw new Error(`backfill: ${sent.Failed.length} messages were not queued (${sent.Failed[0]?.Message ?? "no reason"})`);
        result.queued += batch.length;
      }
    } while (token);
  }
  return result;
}

export const handler = async (input: BackfillInput = {}): Promise<BackfillResult> => {
  const bucket = process.env.S3_MEDIA_BUCKET;
  const queueUrl = process.env.RENDITION_QUEUE_URL;
  if (!bucket || !queueUrl) throw new Error("S3_MEDIA_BUCKET and RENDITION_QUEUE_URL must be configured");
  const result = await backfill(input ?? {}, {
    s3: new S3Client({}), sqs: new SQSClient({}), bucket, queueUrl, repo: createRenditionRepository(),
  });
  logger.info(result, "media: backfill queued");
  return result;
};
