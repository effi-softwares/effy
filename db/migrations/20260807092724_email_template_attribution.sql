-- +goose Up
-- 038-email-template-system: attribute a delivery outcome to the message that caused it.
--
-- 037 records every outcome SES reports, keyed (message_id, event_type, address). It can answer
-- "is this address undeliverable?" It cannot answer "WHICH MESSAGE is bouncing?" — and once the
-- platform sends dozens of message types, that is the question an operator actually asks.
--
-- Platform-sent messages carry an SES message tag `effy-template`, which surfaces in the event
-- payload as `mail.tags`. 037's existing consumer now reads it and writes it here. See
-- specs/038-email-template-system/data-model.md.
--
-- ⚠ NULLABLE, AND PERMANENTLY SO — for two independent reasons, either sufficient on its own:
--   1. Rows written before this slice have no template; a backfill would have to invent one.
--   2. ⚠ Messages COGNITO sends (sign-up, password reset, verification, MFA) are sent by Cognito
--      itself, so the platform cannot attach a tag to them. They will always land here with a NULL
--      template. A NOT NULL column would either require a fabricated value or break that path.
--
-- A NULL therefore MEANS "sent by Cognito, or sent before 038" — it is data, not a gap, and the
-- read model must present it that way rather than as unknown/missing.
--
-- No change to public.email_delivery_status: that table is one row per ADDRESS (the current
-- conclusion about a person), and a template is a property of a MESSAGE. One address receives many
-- message types; putting template_id there would let the last message to bounce overwrite the rest.

ALTER TABLE public.email_delivery_event
    ADD COLUMN template_id text NULL;

COMMENT ON COLUMN public.email_delivery_event.template_id IS
    'The @effy/email-kit template id from the SES `effy-template` message tag (038). NULL means the '
    'message was sent by Cognito (which cannot be tagged) or predates 038 — data, not a gap.';

-- +goose Down
ALTER TABLE public.email_delivery_event
    DROP COLUMN IF EXISTS template_id;
