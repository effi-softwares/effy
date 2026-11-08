-- 111 Notification preferences & marketing consent (specs/111-notification-preferences).
--
-- • customer_notification_choice: a customer's on/off for a changeable category on one channel. No row = the category's
--   default, declared once in @effy/shared-types notification-categories.ts (never stored here).
-- • customer_marketing_consent: every yes and no to offers / news, append-only; the latest answer is the current one
--   (view marketing_consent_current, the one reader the sending rules use).
-- • notification_settings: the promotional push limits staff set (one row), with its change log.
-- • notification_delivery.not_before: a promotional push held for quiet hours; the drain claims it after then.
--   Statuses gain `skipped` (the person's choice) and `capped` (over the limits).
-- • notification_marketing_idx: the limits count a customer's promotional pushes from their marketing rows only.
-- Additive: code from before 111 never reads the new tables or column, and the status list only widens.

-- +goose Up
CREATE TABLE public.customer_notification_choice (
    customer_id uuid NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE,
    category text NOT NULL,
    channel text NOT NULL,
    enabled boolean NOT NULL,
    surface text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (customer_id, category, channel),
    -- Only the categories a customer may change (the policy's `changeable`); required ones have no row, ever.
    CONSTRAINT customer_notification_choice_category_check CHECK (category = ANY (ARRAY['orders', 'points', 'offers', 'news'])),
    CONSTRAINT customer_notification_choice_channel_check CHECK (channel = ANY (ARRAY['push', 'email'])),
    -- Offers and news are not sent by email yet (backlog E11), so there is nothing to choose there.
    CONSTRAINT customer_notification_choice_channel_ck CHECK (category <> ALL (ARRAY['offers', 'news']) OR channel = 'push'),
    CONSTRAINT customer_notification_choice_surface_check CHECK (surface = ANY (ARRAY['app', 'web']))
);

CREATE TABLE public.customer_marketing_consent (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE,
    category text NOT NULL,
    granted boolean NOT NULL,
    surface text NOT NULL,
    via text NOT NULL,
    -- The version of Effy's wording the customer was shown (@effy/legal-content consent/marketing.json).
    wording_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_marketing_consent_category_check CHECK (category = ANY (ARRAY['offers', 'news'])),
    CONSTRAINT customer_marketing_consent_surface_check CHECK (surface = ANY (ARRAY['app', 'web'])),
    CONSTRAINT customer_marketing_consent_via_check CHECK (via = ANY (ARRAY['prompt', 'settings', 'inbox'])),
    CONSTRAINT customer_marketing_consent_wording_check CHECK (char_length(wording_version) BETWEEN 1 AND 64)
);

CREATE INDEX customer_marketing_consent_latest_idx
    ON public.customer_marketing_consent (customer_id, category, created_at DESC);

-- The current answer per customer and category: the latest row. The only reader of "is it yes now".
CREATE VIEW public.marketing_consent_current AS
    SELECT DISTINCT ON (customer_id, category)
           customer_id, category, granted, surface, via, wording_version, created_at
      FROM public.customer_marketing_consent
     ORDER BY customer_id, category, created_at DESC, id DESC;

-- A record of consent is never rewritten: shopper-facing services may add to it, not change or remove it. The erasure
-- purge (notifications service) runs as the owner.
REVOKE UPDATE, DELETE ON TABLE public.customer_marketing_consent FROM effy_shopper;

CREATE TABLE public.notification_settings (
    id smallint DEFAULT 1 NOT NULL PRIMARY KEY,
    promo_push_per_day integer DEFAULT 1 NOT NULL,
    promo_push_per_week integer DEFAULT 3 NOT NULL,
    updated_by text DEFAULT 'migration' NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_settings_id_check CHECK (id = 1),
    CONSTRAINT notification_settings_day_check CHECK (promo_push_per_day BETWEEN 0 AND 20),
    CONSTRAINT notification_settings_week_check CHECK (promo_push_per_week BETWEEN promo_push_per_day AND 100)
);
INSERT INTO public.notification_settings (id) VALUES (1);

CREATE TABLE public.notification_settings_change (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    field text NOT NULL,
    old_value text NOT NULL,
    new_value text NOT NULL,
    changed_by text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Read by notify() everywhere; written only by back-office (orders service, owner role).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.notification_settings FROM effy_shopper;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.notification_settings_change FROM effy_shopper;

ALTER TABLE public.notification_delivery ADD COLUMN not_before timestamp with time zone;
ALTER TABLE public.notification_delivery ADD CONSTRAINT notification_delivery_not_before_ck
    CHECK (not_before IS NULL OR channel = 'push');
ALTER TABLE public.notification_delivery DROP CONSTRAINT notification_delivery_status_check;
ALTER TABLE public.notification_delivery ADD CONSTRAINT notification_delivery_status_check CHECK (status = ANY (ARRAY[
    'pending', 'sent', 'no_device', 'muted', 'failed', 'expired', 'skipped', 'capped']));

-- The promotion limits count a customer's marketing pushes in the last week; this keeps that to their marketing rows.
CREATE INDEX notification_marketing_idx ON public.notification (recipient_sub, created_at)
    WHERE category = ANY (ARRAY['offers', 'news']);

-- +goose Down
DROP INDEX public.notification_marketing_idx;
DELETE FROM public.notification_delivery WHERE status = ANY (ARRAY['skipped', 'capped']);
ALTER TABLE public.notification_delivery DROP CONSTRAINT notification_delivery_status_check;
ALTER TABLE public.notification_delivery ADD CONSTRAINT notification_delivery_status_check CHECK (status = ANY (ARRAY[
    'pending', 'sent', 'no_device', 'muted', 'failed', 'expired']));
ALTER TABLE public.notification_delivery DROP CONSTRAINT notification_delivery_not_before_ck;
ALTER TABLE public.notification_delivery DROP COLUMN not_before;

DROP TABLE public.notification_settings_change;
DROP TABLE public.notification_settings;
DROP VIEW public.marketing_consent_current;
DROP TABLE public.customer_marketing_consent;
DROP TABLE public.customer_notification_choice;
