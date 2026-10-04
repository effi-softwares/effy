-- +goose Up
-- 066-delivery-instructions — what a customer tells the driver.
--
-- Spec: specs/066-delivery-instructions/spec.md. Data model: ../data-model.md. Research: ../research.md.
--
-- A customer can say how they want an order handed over ("leave at the door" / "meet at the door")
-- and add a note of up to 250 characters. The order keeps what was said at placement; an address can
-- carry a default that prefills the next checkout.
--
-- ⚠ THE ORDER'S INSTRUCTIONS ARE COLUMNS, DELIBERATELY NOT KEYS INSIDE `delivery_address`. That
-- jsonb snapshot is read by fifteen files across seven services — including the SHOP console and the
-- RECEIPT EMAIL, neither of which may show instructions (FR-025, FR-027). A key inside the jsonb
-- would be one refactor of a mapper away from reaching both, with nothing failing. A column has to
-- be selected on purpose, and a guard test fails naming any shop or email code path that does.
--
-- ⚠ NO BACKFILL AND NO DEFAULT. NULL means the customer said nothing — which is every order placed
-- before 066 — and readers show NOTHING for it: no placeholder, no cheerful default sentence.

ALTER TABLE public."order"
    ADD COLUMN delivery_handover text
        CONSTRAINT order_delivery_handover_check
        CHECK (delivery_handover IS NULL OR delivery_handover IN ('leave_at_door', 'meet_at_door')),
    ADD COLUMN delivery_note text
        CONSTRAINT order_delivery_note_check
        CHECK (delivery_note IS NULL OR (char_length(delivery_note) <= 250 AND btrim(delivery_note) <> ''));

COMMENT ON COLUMN public."order".delivery_handover IS
    'How the customer asked for the order to be handed over (066): leave_at_door | meet_at_door, or NULL for no preference. A REQUEST to the driver, not a constraint on how the drop is completed. Written by checkout at payment intent and rewritten by each intent until the order is paid; nothing writes it afterwards.';
COMMENT ON COLUMN public."order".delivery_note IS
    'The customer''s note to the driver (066), at most 250 characters, never blank. Customer-authored free text that may contain a gate code or phone number: shown as PLAIN TEXT to the customer, the assigned driver and back-office staff ONLY — never to shops, never in an email, never in telemetry or logs. ⚠ char_length counts code points, matching the shared validation rule.';

ALTER TABLE public.customer_address
    ADD COLUMN default_delivery_handover text
        CONSTRAINT customer_address_default_handover_check
        CHECK (default_delivery_handover IS NULL OR default_delivery_handover IN ('leave_at_door', 'meet_at_door')),
    ADD COLUMN default_delivery_note text
        CONSTRAINT customer_address_default_note_check
        CHECK (default_delivery_note IS NULL OR (char_length(default_delivery_note) <= 250 AND btrim(default_delivery_note) <> ''));

COMMENT ON COLUMN public.customer_address.default_delivery_note IS
    'The instructions this address PREFILLS at checkout (066). ⚠ Read by the address book only — checkout never reads it on the server; an order stores exactly what its own request carried, which is why editing or deleting an address cannot change a placed order.';

-- +goose Down
-- Dev single-step rollback only; lossy.
ALTER TABLE public.customer_address
    DROP COLUMN IF EXISTS default_delivery_note,
    DROP COLUMN IF EXISTS default_delivery_handover;
ALTER TABLE public."order"
    DROP COLUMN IF EXISTS delivery_note,
    DROP COLUMN IF EXISTS delivery_handover;
