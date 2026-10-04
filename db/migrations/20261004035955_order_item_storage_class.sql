-- +goose Up
-- 065-driver-item-manifest — the temperature class of an order line, fixed at purchase.
--
-- Spec: specs/065-driver-item-manifest/spec.md. Data model: ../data-model.md. Research: ../research.md.
--
-- A driver is told which items are Frozen, Chilled or Normal. That class describes goods already
-- picked and packed, so it is a SNAPSHOT on the receipt line — like `product_name` and
-- `unit_price_amount` beside it — and not a read of the live catalogue: a shop editing a product's
-- storage requirement tomorrow must not rewrite what a driver is told about today's bag (FR-009).
--
-- The values are the CATALOGUE'S OWN vocabulary (the `storage` attribute's allowed values), not the
-- driver-facing words. "Normal" is a presentation of `ambient`, applied once in the driver service;
-- storing it here would give `ambient` a second name in the database.

ALTER TABLE public.order_item
    ADD COLUMN storage_class text
        CHECK (storage_class IS NULL OR storage_class IN ('frozen', 'chilled', 'ambient'));

COMMENT ON COLUMN public.order_item.storage_class IS
    'The product''s storage requirement AT PLACEMENT (065): frozen | chilled | ambient. A snapshot, never updated after the order is paid. Written by checkout for every line from 065 on — a product with no storage attribute is written as ambient. ⚠ NULL means the line was sold BEFORE 065 and is deliberately NOT backfilled: reading the product''s current attribute would assert a class nobody observed at purchase. Readers must present NULL as "not recorded", never as ambient.';

-- +goose Down
-- Dev single-step rollback only; lossy (the snapshots are not recoverable from the live catalogue).
ALTER TABLE public.order_item DROP COLUMN IF EXISTS storage_class;
