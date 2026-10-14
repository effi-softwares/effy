-- +goose Up
-- 086 — which smaller copies of a shopper picture exist.
--
-- One row per ORIGINAL picture (`products/…` or `promotions/…`) that the media worker has attempted.
-- ⚠ ONE WRITER: `apis/edge-api/media` (`render`, and the backfill through it). Readers — storefront
-- and commerce — join it on the storage key and send the widths to clients, which derive each copy's
-- address (`renditionUrl`, @effy/shared-types). A copy is only ever named once its row is `ready`:
-- a `<source>` naming a missing file shows a broken picture instead of falling back.
--
-- No foreign key: the worker can see a picture before its owner registers it.
-- `effy_shopper` (storefront, commerce) reads it through the shopper-role migration's default
-- privileges; no grant here.
--
-- ⚠ ADDITIVE: nothing reads it until the 086 services are deployed.
CREATE TABLE public.media_rendition (
    storage_key   text        PRIMARY KEY,
    status        text        NOT NULL,
    widths        int[]       NOT NULL DEFAULT '{}',
    format        text        NOT NULL DEFAULT 'webp',
    source_width  int,
    source_height int,
    failure       text,
    rendered_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT media_rendition_key_ck     CHECK (storage_key LIKE 'products/%' OR storage_key LIKE 'promotions/%'),
    CONSTRAINT media_rendition_status_ck  CHECK (status IN ('ready', 'failed')),
    CONSTRAINT media_rendition_format_ck  CHECK (format IN ('webp')),
    CONSTRAINT media_rendition_failure_ck CHECK (
        (status = 'failed' AND failure IN ('unsupported', 'corrupt', 'too_large'))
        OR (status = 'ready' AND failure IS NULL)
    ),
    CONSTRAINT media_rendition_failed_empty_ck CHECK (status = 'ready' OR cardinality(widths) = 0),
    -- Every width an integer 1–1280. (Ascending order is the writer's rule; a CHECK cannot see it cheaply.)
    CONSTRAINT media_rendition_widths_ck  CHECK (1 <= ALL (widths) AND 1280 >= ALL (widths) AND array_position(widths, NULL) IS NULL)
);

COMMENT ON TABLE public.media_rendition IS 'Which smaller WebP copies of an original shopper picture exist (086). ONE writer: the media worker. Copy key: renditions/<key without extension>/w<width>.webp. Readers send `widths` as imageWidths; a client names a copy only from these.';
COMMENT ON COLUMN public.media_rendition.widths IS 'The copies made, ascending: the steps 160/320/640/1280 below the source width, plus the source width when it is 1280 or less. Empty when failed, or for an animated original (served as is).';
COMMENT ON COLUMN public.media_rendition.failure IS 'Why no copies could be made: unsupported | corrupt | too_large. Each one raises an alarm (FR-020); the backfill retries them with retryFailed.';

-- +goose Down
DROP TABLE public.media_rendition;
