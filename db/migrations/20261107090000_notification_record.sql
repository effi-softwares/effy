-- 109 Notification record & destinations, Stage A (specs/109-notification-record).
--
-- • public.notification is what a person was told: one row per person per event, with the words as sent, a
--   category, where a tap leads (`destination`, one of the audience's closed list) and seen / read / archived /
--   expiry state. It is kept even when no channel delivers it (the inbox, spec 2).
-- • public.notification_delivery is one channel of a notification (push or email) with its own outcome.
-- • ONE writer: @effy/edge-shared/notifications notify.ts (notifications.guard.test.ts).
-- • Additive. public.notification_request stays and is still drained until Stage B drops it, because its writers run
--   inside payment and delivery transactions in eight services that are deployed one after another.

-- +goose Up
CREATE TABLE public.notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    recipient_sub text NOT NULL,
    audience text NOT NULL,
    type text NOT NULL,
    category text NOT NULL,
    importance text DEFAULT 'normal' NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    -- What it is about (an order, consignment, run, product…). For email rendering and analytics; never shown.
    entity_id text,
    destination jsonb NOT NULL,
    source text DEFAULT 'system' NOT NULL,
    seen_at timestamp with time zone,
    read_at timestamp with time zone,
    archived_at timestamp with time zone,
    expires_at timestamp with time zone,
    dedupe_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_dedupe_key_key UNIQUE (dedupe_key),
    CONSTRAINT notification_audience_check CHECK (audience = ANY (ARRAY['customer', 'driver', 'shop'])),
    CONSTRAINT notification_type_check CHECK (type = ANY (ARRAY[
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered', 'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed', 'shop_product_approved',
        'shop_product_sent_back', 'points_credited', 'points_expiring', 'order_with_courier', 'order_delivery_changed',
        'run_changed', 'run_withdrawn', 'run_opens_soon',
        'shop_product_held', 'shop_product_released', 'shop_product_added_by_effy', 'shop_products_imported'])),
    -- The later categories (offers … announcements) are allowed now so spec 3 needs no migration for them.
    CONSTRAINT notification_category_check CHECK (category = ANY (ARRAY[
        'orders', 'points', 'work', 'stock', 'products', 'offers', 'news', 'important', 'support', 'announcements'])),
    CONSTRAINT notification_importance_check CHECK (importance = ANY (ARRAY['normal', 'important'])),
    CONSTRAINT notification_source_check CHECK (source = ANY (ARRAY['system', 'campaign', 'direct'])),
    CONSTRAINT notification_title_check CHECK (char_length(title) BETWEEN 1 AND 120),
    CONSTRAINT notification_body_check CHECK (char_length(body) BETWEEN 1 AND 500),
    CONSTRAINT notification_destination_check CHECK (jsonb_typeof(destination) = 'object' AND destination ? 'kind'),
    -- Reading implies seeing.
    CONSTRAINT notification_read_seen_ck CHECK (read_at IS NULL OR seen_at IS NOT NULL)
);

-- A person's list and unread count (spec 2), created now so spec 2 needs no migration.
CREATE INDEX notification_recipient_idx ON public.notification (recipient_sub, audience, created_at DESC)
    WHERE archived_at IS NULL;
-- The daily purge.
CREATE INDEX notification_retention_idx ON public.notification (audience, created_at);

CREATE TABLE public.notification_delivery (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    notification_id uuid NOT NULL REFERENCES public.notification(id) ON DELETE CASCADE,
    channel text NOT NULL,
    -- Snapshotted when the delivery is created; email only.
    recipient_email text,
    status text DEFAULT 'pending' NOT NULL,
    -- 0 = immediate (every system notification), 1 = bulk (spec 4): a single notification never waits behind a bulk send.
    priority smallint DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    -- An error class only, never a token.
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT notification_delivery_channel_key UNIQUE (notification_id, channel),
    CONSTRAINT notification_delivery_channel_check CHECK (channel = ANY (ARRAY['push', 'email'])),
    CONSTRAINT notification_delivery_status_check CHECK (status = ANY (ARRAY[
        'pending', 'sent', 'no_device', 'muted', 'failed', 'expired'])),
    CONSTRAINT notification_delivery_priority_check CHECK (priority IN (0, 1)),
    CONSTRAINT notification_delivery_email_addressed CHECK (channel <> 'email' OR recipient_email IS NOT NULL)
);

CREATE INDEX notification_delivery_pending_idx ON public.notification_delivery (priority, created_at)
    WHERE status = 'pending';
CREATE INDEX notification_delivery_retention_idx ON public.notification_delivery (created_at);

-- +goose Down
DROP TABLE public.notification_delivery;
DROP TABLE public.notification;
