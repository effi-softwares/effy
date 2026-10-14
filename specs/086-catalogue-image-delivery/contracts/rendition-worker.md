# Contract: the rendition worker (`apis/edge-api/media`)

**Feature**: 086 · R5, R6, R11, R12 in [research.md](../research.md)

A new service with **no HTTP route**: it attaches to neither gateway, so neither gateway's integration
count changes. Stack `effy-edge-media-<stage>`; functions `render` and `renditionBackfill`.

## Input: one SQS message per original

The S3 event notification's own JSON (`Records[].s3.object.key`, URL-encoded with `+` for spaces),
delivered through the queue `effy-<env>-media-renditions` (SSM `/effy/<env>/media/rendition_queue_arn` for the
event source, `/effy/<env>/media/rendition_queue_url` for the backfill's sends). The backfill sends the same shape. SQS batch size 1.
S3's `s3:TestEvent` message is acknowledged and ignored.

## `render` — behaviour per key

1. Decode the key. **Refuse** (acknowledge, log, no row) a key outside `products/` and `promotions/` —
   the notification filter should make this impossible; the check makes it certain.
2. `GetObject` the original. Not found (deleted since) → acknowledge, no row.
3. Read its metadata with `sharp` (`limitInputPixels` = 50 MP, EXIF orientation applied).
   - Not an image sharp can read → upsert `failed` / `corrupt`.
   - Over the pixel limit → `failed` / `too_large`.
   - A format outside JPEG/PNG/WebP → `failed` / `unsupported`.
4. An animated original (`pages > 1`) → upsert `ready` with no widths and stop (the original is served).
   Otherwise, for each width in `[160, 320, 640, 1280]` **below** the oriented source width, **plus the
   source width itself when it is ≤ 1280**: resize to that width (height by aspect, no enlarging), WebP
   q78 effort 4, alpha kept, metadata stripped; `PutObject` to
   `renditions/<key without extension>/w<width>.webp` with `Content-Type: image/webp`.
5. Upsert `ready` with the widths written and the source dimensions.
6. Emit `RenditionsCreated` or `RenditionFailed` (namespace `Effy/Media`, **no dimensions** — the alarm
   watches the bare metric) and log the key, the reason and the milliseconds taken.

A **thrown** error (S3 or the database unreachable) leaves the message for SQS to retry; after 3
receives it moves to `effy-<env>-media-renditions-dlq`, which alarms. A `failed` row is **not** an
error: it is recorded and acknowledged.

Idempotent: re-processing a key rewrites the same objects and upserts the same row.

## `renditionBackfill` — operator-invoked

```text
serverless invoke -f renditionBackfill --stage dev [--data '{"retryFailed": true, "prefix": "products/"}']
```

Lists `products/` and `promotions/` (or the one `prefix` given), skips keys with a `ready` row (and a
`failed` row unless `retryFailed`), skips anything that is not `.jpg`/`.jpeg`/`.png`/`.webp`, and
sends one message per remaining key. Returns:

```json
{ "listed": 1234, "alreadyReady": 1100, "queued": 130, "skippedFailed": 4 }
```

## Permissions (least)

- `s3:GetObject` on `<bucket>/products/*`, `<bucket>/promotions/*`
- `s3:PutObject` on `<bucket>/renditions/*` only
- `s3:ListBucket` on the bucket with `s3:prefix` conditioned to `products/` and `promotions/`
  (backfill only)
- `sqs:ReceiveMessage`, `DeleteMessage`, `GetQueueAttributes` on the queue; `sqs:SendMessage`
  (backfill only)
- Database: the master role through the existing secret, like the other workers; it writes one table.
