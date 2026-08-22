-- +goose Up
-- 049 US2 correction: a customer drop's destination is the order's delivery_address (a jsonb snapshot
-- captured at checkout on public."order") — there is NO FK from an order to a customer_address row
-- (guest checkout; address edited post-save). So delivery_task must not REQUIRE a customer_address_id;
-- the drop reads the address from the order. Make the column nullable (kept for optional later linkage).
-- Forward-only; safe (relaxing a NOT NULL never rejects existing rows).
ALTER TABLE public.delivery_task ALTER COLUMN customer_address_id DROP NOT NULL;
COMMENT ON COLUMN public.delivery_task.customer_address_id IS
  'OPTIONAL (049). The drop address is order.delivery_address (jsonb snapshot); this column is a nullable hook for later linkage to a saved customer_address, not the source of the delivery address.';

-- +goose Down
ALTER TABLE public.delivery_task ALTER COLUMN customer_address_id SET NOT NULL;
