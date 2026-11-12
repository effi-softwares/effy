-- 116 Reaching the right place (specs/116-links-badges-urgency): the app icon badge stays right when the inbox changes
-- somewhere other than the phone.
--
-- • notification_badge_correction: "this person's badge is out of date" - one row per person and audience, so a burst of
--   changes is one correction (PK). Queued by @effy/edge-shared/notifications badge.ts; claimed by the notifications drain;
--   deleted by erasure. Customers and drivers only: the shop console's badge follows the count live (110).
-- • notification_badge_sweep: the expiry sweep's watermark (one row). An expiry or withdrawal between it and now queues a
--   correction, so a skipped drain run is caught up by the next.
-- • notification_expiring_unseen_idx: the sweep's range scan over unseen items that will expire.

-- +goose Up
CREATE TABLE public.notification_badge_correction (
    recipient_sub text NOT NULL,
    audience text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_badge_correction_pkey PRIMARY KEY (recipient_sub, audience),
    CONSTRAINT notification_badge_correction_audience_check CHECK (audience = ANY (ARRAY['customer', 'driver']))
);
CREATE INDEX notification_badge_correction_due_idx ON public.notification_badge_correction (requested_at);

CREATE TABLE public.notification_badge_sweep (
    id smallint NOT NULL PRIMARY KEY,
    swept_to timestamp with time zone NOT NULL,
    CONSTRAINT notification_badge_sweep_one_row CHECK (id = 1)
);
INSERT INTO public.notification_badge_sweep (id, swept_to) VALUES (1, now());

CREATE INDEX notification_expiring_unseen_idx ON public.notification (expires_at)
    WHERE seen_at IS NULL AND archived_at IS NULL AND expires_at IS NOT NULL;

-- Written by service code on the owner role; shoppers never see them.
REVOKE ALL ON TABLE public.notification_badge_correction FROM effy_shopper;
REVOKE ALL ON TABLE public.notification_badge_sweep FROM effy_shopper;

-- +goose Down
DROP INDEX public.notification_expiring_unseen_idx;
DROP TABLE public.notification_badge_sweep;
DROP TABLE public.notification_badge_correction;
