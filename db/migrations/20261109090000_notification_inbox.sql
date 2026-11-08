-- 110 Notification inboxes (specs/110-notification-inboxes).
--
-- • pinned_until: an important notification stays above the rest of a person's inbox until it is read or this passes.
-- • driver_runs_today: a driver whose assignment found no phone is told, once a day, when they next sign in (R11).
-- • notification_unseen_idx: the bell count and the app-icon badge read only unseen rows, however long the history.
-- Additive: code from before 110 never reads pinned_until, and the type list only widens.

-- +goose Up
ALTER TABLE public.notification ADD COLUMN pinned_until timestamp with time zone;
ALTER TABLE public.notification ADD CONSTRAINT notification_pinned_important_ck
    CHECK (pinned_until IS NULL OR importance = 'important');

ALTER TABLE public.notification DROP CONSTRAINT notification_type_check;
ALTER TABLE public.notification ADD CONSTRAINT notification_type_check CHECK (type = ANY (ARRAY[
    'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered', 'shop_new_order', 'run_assigned',
    'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed', 'shop_product_approved',
    'shop_product_sent_back', 'points_credited', 'points_expiring', 'order_with_courier', 'order_delivery_changed',
    'run_changed', 'run_withdrawn', 'run_opens_soon',
    'shop_product_held', 'shop_product_released', 'shop_product_added_by_effy', 'shop_products_imported',
    'driver_runs_today']));

CREATE INDEX notification_unseen_idx ON public.notification (recipient_sub, audience)
    WHERE seen_at IS NULL AND archived_at IS NULL;

-- +goose Down
DROP INDEX public.notification_unseen_idx;

DELETE FROM public.notification WHERE type = 'driver_runs_today';
ALTER TABLE public.notification DROP CONSTRAINT notification_type_check;
ALTER TABLE public.notification ADD CONSTRAINT notification_type_check CHECK (type = ANY (ARRAY[
    'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered', 'shop_new_order', 'run_assigned',
    'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed', 'shop_product_approved',
    'shop_product_sent_back', 'points_credited', 'points_expiring', 'order_with_courier', 'order_delivery_changed',
    'run_changed', 'run_withdrawn', 'run_opens_soon',
    'shop_product_held', 'shop_product_released', 'shop_product_added_by_effy', 'shop_products_imported']));

ALTER TABLE public.notification DROP CONSTRAINT notification_pinned_important_ck;
ALTER TABLE public.notification DROP COLUMN pinned_until;
