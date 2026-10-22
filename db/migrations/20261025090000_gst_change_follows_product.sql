-- +goose Up
-- 096 — a product's GST history goes with the product. A shop may delete a DRAFT product (016), and
-- since 096 every product has a history row from the moment it is created; without a cascade, deleting
-- a draft fails on this foreign key. A live product is never deleted (it is archived), so no history
-- that a tax invoice relies on can be lost this way — invoices freeze the status on the order line.
ALTER TABLE public.product_gst_change
    DROP CONSTRAINT product_gst_change_product_id_fkey,
    ADD CONSTRAINT product_gst_change_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.product (id) ON DELETE CASCADE;

-- +goose Down
ALTER TABLE public.product_gst_change
    DROP CONSTRAINT product_gst_change_product_id_fkey,
    ADD CONSTRAINT product_gst_change_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.product (id);
