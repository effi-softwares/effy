-- +goose Up
-- Driver backlog D2 — three more things a driver is told about their work, by push:
--   run_changed    — a round they are working was re-ordered, or lost or gained stops;
--   run_withdrawn  — a round was taken off them (moved to another driver, or ended);
--   run_opens_soon — a round of theirs opens in a few minutes.
-- Produced by the fleet service in the transaction that makes the change; worded in
-- notifications/src/worker/copy.ts. ⚠ Deploy order: this migration, then notifications, then fleet —
-- a producer writing a type the worker does not know is skipped, never sent.
ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed',
        'shop_product_approved', 'shop_product_sent_back',
        'points_credited', 'points_expiring',
        'order_with_courier',
        'order_delivery_changed',
        'run_changed', 'run_withdrawn', 'run_opens_soon'
    ));

-- +goose Down
ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
DELETE FROM public.notification_request WHERE type IN ('run_changed', 'run_withdrawn', 'run_opens_soon');
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed',
        'shop_product_approved', 'shop_product_sent_back',
        'points_credited', 'points_expiring',
        'order_with_courier',
        'order_delivery_changed'
    ));
