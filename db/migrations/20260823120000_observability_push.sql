-- +goose Up
-- 050-observability-push-foundation: the push-notification data plane.
--
-- Two tables, both in `public` (house style: raw SQL, text CHECK enums, an index on every FK-like
-- lookup, COMMENT ON everything; no native PG enums, no triggers). See
-- specs/050-observability-push-foundation/data-model.md.
--
--   • device_token       — a push-delivery address for one app install on one device, owned by an
--                          authenticated subject. Registered per-audience via the cold-path
--                          /{audience}/v1/devices endpoints; read by the notifications worker to
--                          fan a notification out to a recipient's devices.
--   • notification_request — a TRANSACTIONAL OUTBOX of notification intents. A producer appends a row
--                          in the SAME transaction as the fact it announces (order paid, fulfilment
--                          created, run assigned, …); the scheduled notifications worker drains it and
--                          sends via FCM. UNIQUE(dedupe_key) makes a re-delivered/retried producer
--                          event enqueue exactly once (FR-016). SNS-ready (research R6): the future
--                          SNS/SQS backbone replaces the poll, not this shape.
--
-- ⚠ NO PII beyond the auth subject id (Principle VII, FR-021/022): a token is opaque; audience/
-- platform/type/status are closed enums; the payload carries only routing/render ids + a deep link.

-- ── device_token ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.device_token (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The auth `sub` that owns this token. No FK — it spans four Cognito pools (customer/shop/driver),
    -- a snapshot like every other cross-pool subject reference on the platform.
    subject_sub  text        NOT NULL,
    audience     text        NOT NULL CHECK (audience IN ('customer', 'shop', 'driver')),
    platform     text        NOT NULL CHECK (platform IN ('android', 'ios')),
    -- The opaque FCM registration token. UNIQUE so a device that re-registers (rotation, or handed to
    -- another signed-in user) re-points its single row rather than accumulating duplicates (SC-009).
    fcm_token    text        NOT NULL UNIQUE,
    app_version  text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Fan-out look-up: "all active tokens for this recipient" (the worker's per-recipient resolve).
CREATE INDEX device_token_subject_idx ON public.device_token (subject_sub, audience);

COMMENT ON TABLE  public.device_token IS '050 — one FCM push address per app install per device, owned by an auth subject. No PII beyond the subject sub.';
COMMENT ON COLUMN public.device_token.subject_sub IS 'The owning auth sub (spans four pools; no FK, snapshot).';
COMMENT ON COLUMN public.device_token.fcm_token IS 'Opaque FCM registration token; UNIQUE so re-register upserts and rotation never duplicates.';
COMMENT ON COLUMN public.device_token.last_seen_at IS 'Bumped on every re-register (app open / token refresh).';

-- ── notification_request (transactional outbox) ──────────────────────────────────────────────────
CREATE TABLE public.notification_request (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Who to notify. The producer resolves the recipient (it knows it); the worker resolves tokens.
    recipient_sub  text        NOT NULL,
    audience       text        NOT NULL CHECK (audience IN ('customer', 'shop', 'driver')),
    type           text        NOT NULL CHECK (type IN (
                                   'order_paid', 'order_ready', 'order_out_for_delivery',
                                   'order_delivered', 'shop_new_order', 'run_assigned')),
    -- Minimal non-PII routing/render data: { "entityId": "...", "deepLink": "effy://..." }.
    payload        jsonb       NOT NULL,
    -- Idempotency (FR-016): "<type>:<recipient_sub>:<entityId>". A re-delivered producer event is a
    -- no-op via ON CONFLICT DO NOTHING at insert.
    dedupe_key     text        NOT NULL UNIQUE,
    status         text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    attempts       int         NOT NULL DEFAULT 0,
    last_error     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    processed_at   timestamptz
);

-- The worker's drain query: WHERE status='pending' ORDER BY created_at ... FOR UPDATE SKIP LOCKED.
CREATE INDEX notification_request_pending_idx ON public.notification_request (status, created_at);

COMMENT ON TABLE  public.notification_request IS '050 — transactional outbox of notification intents; drained by the scheduled notifications worker. SNS-ready (research R6).';
COMMENT ON COLUMN public.notification_request.recipient_sub IS 'The subject to notify; the worker resolves this to device tokens.';
COMMENT ON COLUMN public.notification_request.dedupe_key IS 'UNIQUE idempotency key <type>:<recipient_sub>:<entityId>; a re-delivered event enqueues once.';
COMMENT ON COLUMN public.notification_request.payload IS 'Minimal non-PII routing/render data only (entityId, deepLink); never a name/address/total.';
COMMENT ON COLUMN public.notification_request.status IS 'pending → sent (>=1 delivered) | skipped (no tokens/permission) | failed (after attempt cap).';

-- +goose Down
-- Dev-only single-step down (003 policy; forward-only in anger).
DROP TABLE IF EXISTS public.notification_request;
DROP TABLE IF EXISTS public.device_token;
