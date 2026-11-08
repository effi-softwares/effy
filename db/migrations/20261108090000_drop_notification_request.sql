-- 109 Notification record & destinations, Stage B (specs/109-notification-record, task T059).
--
-- public.notification_request was the outbox before 109. Since Stage A every writer goes through notify()
-- (public.notification + public.notification_delivery) and the worker only drained what was left. Deploy the
-- notifications service from this tree FIRST (it no longer reads this table), then run this migration.
--
-- Refuses while any row is still pending, so nothing that was promised to someone is dropped unsent.

-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.notification_request WHERE status = 'pending') THEN
        RAISE EXCEPTION 'notification_request still has pending rows: let the Stage A worker drain them first';
    END IF;
END $$;
-- +goose StatementEnd

DROP TABLE public.notification_request;

-- +goose Down
-- The table comes back empty, as it stood after 102; its rows do not.
CREATE TABLE public.notification_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    recipient_sub text NOT NULL,
    audience text NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    dedupe_key text NOT NULL UNIQUE,
    status text DEFAULT 'pending' NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    channel text DEFAULT 'push' NOT NULL,
    recipient_email text,
    CONSTRAINT notification_request_audience_check CHECK (audience IN ('customer', 'shop', 'driver')),
    CONSTRAINT notification_request_channel_check CHECK (channel IN ('push', 'email')),
    CONSTRAINT notification_request_email_addressed CHECK (channel <> 'email' OR recipient_email IS NOT NULL),
    CONSTRAINT notification_request_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    CONSTRAINT notification_request_type_check CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered', 'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed', 'shop_product_approved',
        'shop_product_sent_back', 'points_credited', 'points_expiring', 'order_with_courier', 'order_delivery_changed',
        'run_changed', 'run_withdrawn', 'run_opens_soon',
        'shop_product_held', 'shop_product_released', 'shop_product_added_by_effy', 'shop_products_imported'))
);
CREATE INDEX notification_request_channel_status_idx ON public.notification_request (channel, status) WHERE status = 'pending';
CREATE INDEX notification_request_pending_idx ON public.notification_request (status, created_at);
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE public.notification_request TO effy_shopper;
