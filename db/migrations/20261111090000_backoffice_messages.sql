-- 112 Back-office messages (specs/112-backoffice-messages).
--
-- • message: what staff send (announcement, important, offer, news, direct), its words, picture, status and the
--   sending cursor. Written by the admin service (messages/repository.ts) and the notifications worker only.
-- • message_audience: one row per audience a message is for, with its filter (a closed shape, @effy/shared-types
--   messages.ts), where a tap leads, the matched count and, once the rows are purged, the frozen report.
-- • message_event: the activity log, append-only.
-- • notification gains message_id + image_url and three types (customer_message, driver_message, shop_message): every
--   recipient's notification is still written by notify(), so 111's consent, choices, limits and night hold apply.
-- • notification_settings gains the largest number of people one message may reach.
-- Additive: code from before 112 never reads the new tables or columns, and the type list only widens.

-- +goose Up
CREATE TABLE public.message (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    kind text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    picture_key text,
    push boolean DEFAULT true NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    send_at timestamp with time zone,
    ends_at timestamp with time zone,
    sent_at timestamp with time zone,
    cursor_audience text,
    cursor_sub text,
    not_sent_reason text,
    withdrawn_at timestamp with time zone,
    withdraw_announced_at timestamp with time zone,
    duplicated_from uuid REFERENCES public.message(id),
    version integer DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_kind_check CHECK (kind = ANY (ARRAY['announcement', 'important', 'offer', 'news', 'direct'])),
    CONSTRAINT message_title_check CHECK (char_length(title) BETWEEN 1 AND 60),
    CONSTRAINT message_body_check CHECK (char_length(body) BETWEEN 1 AND 500),
    CONSTRAINT message_picture_check CHECK (picture_key IS NULL OR picture_key LIKE 'promotions/messages-%'),
    CONSTRAINT message_status_check CHECK (status = ANY (ARRAY[
        'draft', 'scheduled', 'sending', 'sent', 'stopped', 'cancelled', 'withdrawn', 'not_sent'])),
    CONSTRAINT message_cursor_audience_check CHECK (cursor_audience IS NULL OR cursor_audience = ANY (ARRAY['customer', 'driver', 'shop'])),
    CONSTRAINT message_not_sent_reason_check CHECK (not_sent_reason IS NULL OR not_sent_reason = 'too_many_recipients'),
    CONSTRAINT message_ends_check CHECK (ends_at IS NULL OR send_at IS NULL OR ends_at > send_at),
    -- A direct message always reaches the phone as well as the inbox.
    CONSTRAINT message_direct_push_ck CHECK (kind <> 'direct' OR push),
    CONSTRAINT message_status_fields_ck CHECK (
        (status <> 'scheduled' OR send_at IS NOT NULL)
        AND ((status = 'withdrawn') = (withdrawn_at IS NOT NULL))
        AND ((status = 'not_sent') = (not_sent_reason IS NOT NULL))
    ),
    CONSTRAINT message_version_check CHECK (version >= 1)
);

CREATE INDEX message_list_idx ON public.message (created_at DESC, id DESC);
CREATE INDEX message_due_idx ON public.message (send_at) WHERE status = 'scheduled';
CREATE INDEX message_sending_idx ON public.message (id) WHERE status = 'sending';

CREATE TABLE public.message_audience (
    message_id uuid NOT NULL REFERENCES public.message(id) ON DELETE CASCADE,
    audience text NOT NULL,
    filter jsonb DEFAULT '{}'::jsonb NOT NULL,
    destination jsonb NOT NULL,
    matched_count integer DEFAULT 0 NOT NULL,
    report jsonb,
    report_frozen_at timestamp with time zone,
    PRIMARY KEY (message_id, audience),
    CONSTRAINT message_audience_audience_check CHECK (audience = ANY (ARRAY['customer', 'driver', 'shop'])),
    CONSTRAINT message_audience_filter_check CHECK (jsonb_typeof(filter) = 'object'),
    CONSTRAINT message_audience_destination_check CHECK (jsonb_typeof(destination) = 'object' AND destination ? 'kind'),
    CONSTRAINT message_audience_matched_check CHECK (matched_count >= 0),
    CONSTRAINT message_audience_frozen_check CHECK ((report IS NULL) = (report_frozen_at IS NULL))
);

CREATE TABLE public.message_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    message_id uuid NOT NULL REFERENCES public.message(id) ON DELETE CASCADE,
    event text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_event_event_check CHECK (event = ANY (ARRAY[
        'created', 'duplicated', 'edited', 'test_sent', 'scheduled', 'sending', 'sent', 'stopped', 'cancelled',
        'withdrawn', 'not_sent'])),
    CONSTRAINT message_event_detail_check CHECK (jsonb_typeof(detail) = 'object')
);

CREATE INDEX message_event_idx ON public.message_event (message_id, created_at DESC);

-- Staff tables: written by the admin service and the notifications worker (owner role); shoppers never see them.
REVOKE ALL ON TABLE public.message FROM effy_shopper;
REVOKE ALL ON TABLE public.message_audience FROM effy_shopper;
REVOKE ALL ON TABLE public.message_event FROM effy_shopper;

ALTER TABLE public.notification ADD COLUMN message_id uuid REFERENCES public.message(id);
ALTER TABLE public.notification ADD COLUMN image_url text;
-- Only a message (or a test of one) carries a picture.
ALTER TABLE public.notification ADD CONSTRAINT notification_image_message_ck
    CHECK (image_url IS NULL OR source <> 'system');

ALTER TABLE public.notification DROP CONSTRAINT notification_type_check;
ALTER TABLE public.notification ADD CONSTRAINT notification_type_check CHECK (type = ANY (ARRAY[
    'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered', 'shop_new_order', 'run_assigned',
    'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed', 'shop_product_approved',
    'shop_product_sent_back', 'points_credited', 'points_expiring', 'order_with_courier', 'order_delivery_changed',
    'run_changed', 'run_withdrawn', 'run_opens_soon',
    'shop_product_held', 'shop_product_released', 'shop_product_added_by_effy', 'shop_products_imported',
    'driver_runs_today',
    'customer_message', 'driver_message', 'shop_message']));
-- A message type is never a system notification, and a system type never a campaign or direct one.
ALTER TABLE public.notification ADD CONSTRAINT notification_message_type_ck
    CHECK ((type = ANY (ARRAY['customer_message', 'driver_message', 'shop_message'])) = (source <> 'system'));

-- A message's report, and the messages a person received.
CREATE INDEX notification_message_idx ON public.notification (message_id) WHERE message_id IS NOT NULL;

ALTER TABLE public.notification_settings ADD COLUMN max_recipients_per_message integer DEFAULT 20000 NOT NULL;
ALTER TABLE public.notification_settings ADD CONSTRAINT notification_settings_max_recipients_check
    CHECK (max_recipients_per_message BETWEEN 1 AND 200000);

-- +goose Down
ALTER TABLE public.notification_settings DROP CONSTRAINT notification_settings_max_recipients_check;
ALTER TABLE public.notification_settings DROP COLUMN max_recipients_per_message;
DELETE FROM public.notification_settings_change WHERE field = 'max_recipients_per_message';

DROP INDEX public.notification_message_idx;
DELETE FROM public.notification WHERE type = ANY (ARRAY['customer_message', 'driver_message', 'shop_message']);
ALTER TABLE public.notification DROP CONSTRAINT notification_message_type_ck;
ALTER TABLE public.notification DROP CONSTRAINT notification_type_check;
ALTER TABLE public.notification ADD CONSTRAINT notification_type_check CHECK (type = ANY (ARRAY[
    'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered', 'shop_new_order', 'run_assigned',
    'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed', 'shop_product_approved',
    'shop_product_sent_back', 'points_credited', 'points_expiring', 'order_with_courier', 'order_delivery_changed',
    'run_changed', 'run_withdrawn', 'run_opens_soon',
    'shop_product_held', 'shop_product_released', 'shop_product_added_by_effy', 'shop_products_imported',
    'driver_runs_today']));
ALTER TABLE public.notification DROP CONSTRAINT notification_image_message_ck;
ALTER TABLE public.notification DROP COLUMN image_url;
ALTER TABLE public.notification DROP COLUMN message_id;

DROP TABLE public.message_event;
DROP TABLE public.message_audience;
DROP TABLE public.message;
