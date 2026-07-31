-- +goose Up
-- 028-mobile-home-merchandising: the advertising facet on a promotion.
--
-- Home's promotional banners are not separately authored content. They are the shopper-facing FACE of a
-- promotion the back-office already manages, which is what makes them self-expiring: a banner is live
-- exactly while its promotion is, and the common cause of a stale banner — nobody remembering to take it
-- down — stops being possible. Giving banners their own table and their own window would create two
-- schedules to keep in step, and the second one is the one that goes wrong.
--
-- ⚠ ADVERTISING IS OPT-IN AND DEFAULTS TO FALSE. Private promotions are real and ordinary: a goodwill
-- credit issued to one customer, a partner code. A default of `true` would put every one of them on the
-- public storefront. The default IS the safety control here.
--
-- ⚠ NO COUNTER COLUMN. Whether an advertised promotion is exhausted is COUNTED from promo_redemption at
-- read time, exactly as 027 established for redemptionCount — a counter and the rows can disagree, and
-- then nobody knows which is true. It is also what makes "an exhausted promotion stops being advertised"
-- (FR-037c) enforceable rather than a thing someone has to remember.
--
-- House style (007/009/019/020/021/027): everything operational in `public`; raw SQL; text CHECK enums;
-- COMMENT ON everything. See specs/028-mobile-home-merchandising/data-model.md §1.

ALTER TABLE public.promo_code
    ADD COLUMN is_advertised    boolean NOT NULL DEFAULT false,
    ADD COLUMN banner_title     text NULL,
    ADD COLUMN banner_subtitle  text NULL,
    ADD COLUMN banner_image_key text NULL,
    ADD COLUMN banner_position  int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.promo_code.is_advertised IS 'Whether this promotion may be shown as a banner on the customer storefront Home (028 FR-037a). OPT-IN, always — a promotion that became public by default would hand every shopper a discount issued to one person.';
COMMENT ON COLUMN public.promo_code.banner_title IS 'The shopper-facing headline. REQUIRED whenever is_advertised (promo_code_banner_copy_chk) — the internal `code` is an operator identifier, not a sentence a shopper can read (FR-037b).';
COMMENT ON COLUMN public.promo_code.banner_subtitle IS 'Optional supporting line. The TERMS sentence ("On orders over $30") is composed by the hot path from minimum_subtotal_amount and is deliberately NOT stored here — one place composes it, so web and mobile cannot phrase the same promotion two ways.';
COMMENT ON COLUMN public.promo_code.banner_image_key IS 'S3 object key for optional banner artwork, presigned on read exactly like product media. NEVER a URL — a stored URL expires and then the banner shows a broken frame.';
COMMENT ON COLUMN public.promo_code.banner_position IS 'Where the banner sits in Home''s section sequence: 0 = above the first section, n = after the nth. Out-of-range values are CLAMPED by the client, never dropped — a mistyped number must not silently unpublish a live promotion.';

-- ⚠ A CONSTRAINT, not a service check. The service validates this too, but only so the operator gets a
-- field-level message instead of a 500; the guarantee lives here. A service check can be bypassed by a
-- backfill, a second writer, or a future route. Same reasoning as 027's promo_code_kind_value_chk: make
-- the ill-formed state UNREPRESENTABLE rather than merely rejected.
ALTER TABLE public.promo_code
    ADD CONSTRAINT promo_code_banner_copy_chk CHECK (is_advertised = false OR banner_title IS NOT NULL);

-- PARTIAL, because the hot path only ever reads advertised rows and they are a small minority of the
-- table. It covers the ORDER BY as well as the filter, so the Home read's banner query needs no sort —
-- which matters on a read that already issues up to seven queries inside a 3-second budget.
CREATE INDEX promo_code_advertised_idx
    ON public.promo_code (banner_position, created_at)
    WHERE is_advertised;

-- +goose Down
-- Dev-iteration convenience only (003 forward-only in higher envs; db-down refused unless ENV=dev).
DROP INDEX IF EXISTS public.promo_code_advertised_idx;
ALTER TABLE public.promo_code DROP CONSTRAINT IF EXISTS promo_code_banner_copy_chk;
ALTER TABLE public.promo_code
    DROP COLUMN IF EXISTS banner_position,
    DROP COLUMN IF EXISTS banner_image_key,
    DROP COLUMN IF EXISTS banner_subtitle,
    DROP COLUMN IF EXISTS banner_title,
    DROP COLUMN IF EXISTS is_advertised;
