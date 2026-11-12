-- 115 Messages that do more (specs/115-messages-email-automation): email as a message channel, automatic messages,
-- the first name.
--
-- • customer_notification_choice: offers and news may now have an EMAIL switch (111's "push only" CHECK is dropped -
--   the category policy's `changeable` list governs, enforced by preferences.ts), and a switch may be set from an email
--   (the unsubscribe page or a mail program's one-click).
-- • customer_marketing_consent: each answer says which channel it was about (`notifications` - 111's answers - or
--   `email`), may come from an email, and remembers the message whose unsubscribe link was used.
--   ⚠ marketing_consent_current now reads notification answers only: an email answer must never decide who gets offers.
-- • notification_delivery.not_before: marketing EMAIL is held for the night too.
-- • customer.email_unsubscribe_token: a random, revocable credential for the unsubscribe link (no sign-in).
-- • message: email, the first-name fallback, the automatic message it came from; `{first name}` never in a title.
-- • message_automation (+ _run, _recipient, _event): messages that send themselves on a trigger or a repeat. Every run
--   creates an ordinary message, so 112's sending, report and safeguards apply.
-- Additive: code from before 115 never writes the new values, and every widened CHECK only widens.

-- +goose Up
ALTER TABLE public.customer_notification_choice DROP CONSTRAINT customer_notification_choice_channel_ck;
ALTER TABLE public.customer_notification_choice DROP CONSTRAINT customer_notification_choice_surface_check;
ALTER TABLE public.customer_notification_choice ADD CONSTRAINT customer_notification_choice_surface_check
    CHECK (surface = ANY (ARRAY['app', 'web', 'email']));

ALTER TABLE public.customer_marketing_consent ADD COLUMN channel text DEFAULT 'notifications' NOT NULL;
ALTER TABLE public.customer_marketing_consent ADD CONSTRAINT customer_marketing_consent_channel_check
    CHECK (channel = ANY (ARRAY['notifications', 'email']));
ALTER TABLE public.customer_marketing_consent DROP CONSTRAINT customer_marketing_consent_surface_check;
ALTER TABLE public.customer_marketing_consent ADD CONSTRAINT customer_marketing_consent_surface_check
    CHECK (surface = ANY (ARRAY['app', 'web', 'email']));
ALTER TABLE public.customer_marketing_consent DROP CONSTRAINT customer_marketing_consent_via_check;
ALTER TABLE public.customer_marketing_consent ADD CONSTRAINT customer_marketing_consent_via_check
    CHECK (via = ANY (ARRAY['prompt', 'settings', 'inbox', 'email_link', 'one_click']));

DROP INDEX public.customer_marketing_consent_latest_idx;
CREATE INDEX customer_marketing_consent_latest_idx
    ON public.customer_marketing_consent (customer_id, channel, category, created_at DESC);

-- The current NOTIFICATIONS answer per customer and category - still the only reader of "has this customer said yes".
CREATE OR REPLACE VIEW public.marketing_consent_current AS
    SELECT DISTINCT ON (customer_id, category)
           customer_id, category, granted, surface, via, wording_version, created_at
      FROM public.customer_marketing_consent
     WHERE channel = 'notifications'
     ORDER BY customer_id, category, created_at DESC, id DESC;

-- The current EMAIL answer per customer and category (history and undo; notify() reads the switch, not this).
CREATE VIEW public.marketing_email_consent_current AS
    SELECT DISTINCT ON (customer_id, category)
           customer_id, category, granted, surface, via, wording_version, created_at
      FROM public.customer_marketing_consent
     WHERE channel = 'email'
     ORDER BY customer_id, category, created_at DESC, id DESC;

ALTER TABLE public.notification_delivery DROP CONSTRAINT notification_delivery_not_before_ck;
ALTER TABLE public.notification_delivery ADD CONSTRAINT notification_delivery_not_before_ck
    CHECK (not_before IS NULL OR channel = ANY (ARRAY['push', 'email']));

ALTER TABLE public.customer ADD COLUMN email_unsubscribe_token text;
ALTER TABLE public.customer ADD CONSTRAINT customer_email_unsubscribe_token_key UNIQUE (email_unsubscribe_token);
ALTER TABLE public.customer ADD CONSTRAINT customer_email_unsubscribe_token_check
    CHECK (email_unsubscribe_token IS NULL OR char_length(email_unsubscribe_token) = 43);

CREATE TABLE public.message_automation (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    kind text NOT NULL,
    audience text NOT NULL,
    filter jsonb DEFAULT '{}'::jsonb NOT NULL,
    destination jsonb NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    picture_key text,
    push boolean DEFAULT true NOT NULL,
    email boolean DEFAULT false NOT NULL,
    name_fallback text DEFAULT 'there' NOT NULL,
    mode text NOT NULL,
    trigger_kind text,
    trigger_value integer,
    repeat_every text,
    repeat_days integer[],
    repeat_date integer,
    repeat_time time without time zone,
    starts_on date,
    ends_on date,
    status text DEFAULT 'active' NOT NULL,
    next_run_at timestamp with time zone,
    activated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_automation_name_check CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT message_automation_kind_check CHECK (kind = ANY (ARRAY['announcement', 'important', 'offer', 'news'])),
    CONSTRAINT message_automation_audience_check CHECK (audience = ANY (ARRAY['customer', 'driver', 'shop'])),
    CONSTRAINT message_automation_filter_check CHECK (jsonb_typeof(filter) = 'object'),
    CONSTRAINT message_automation_destination_check CHECK (jsonb_typeof(destination) = 'object' AND destination ? 'kind'),
    CONSTRAINT message_automation_title_check CHECK (char_length(title) BETWEEN 1 AND 60 AND title NOT ILIKE '%{first name%'),
    CONSTRAINT message_automation_body_check CHECK (char_length(body) BETWEEN 1 AND 500),
    CONSTRAINT message_automation_picture_check CHECK (picture_key IS NULL OR picture_key LIKE 'promotions/messages-%'),
    CONSTRAINT message_automation_email_check CHECK (NOT email OR audience = 'customer'),
    CONSTRAINT message_automation_fallback_check CHECK (char_length(name_fallback) BETWEEN 1 AND 20 AND name_fallback !~ '[{}]'),
    CONSTRAINT message_automation_mode_check CHECK (mode = ANY (ARRAY['trigger', 'repeat'])),
    CONSTRAINT message_automation_status_check CHECK (status = ANY (ARRAY['active', 'paused', 'finished'])),
    CONSTRAINT message_automation_trigger_ck CHECK (
        (mode = 'trigger') = (trigger_kind IS NOT NULL AND trigger_value IS NOT NULL)
        AND (trigger_kind IS NULL OR (
            audience = 'customer' AND kind = ANY (ARRAY['offer', 'news'])
            AND ((trigger_kind = 'not_ordered_days' AND trigger_value BETWEEN 7 AND 365)
              OR (trigger_kind = 'cart_left_hours' AND trigger_value BETWEEN 1 AND 72))))
    ),
    CONSTRAINT message_automation_repeat_ck CHECK (
        (mode = 'repeat') = (repeat_every IS NOT NULL AND repeat_time IS NOT NULL AND starts_on IS NOT NULL)
        AND (repeat_every IS NULL OR repeat_every = ANY (ARRAY['day', 'week', 'month']))
        AND (repeat_every IS DISTINCT FROM 'week' OR (repeat_days IS NOT NULL AND cardinality(repeat_days) BETWEEN 1 AND 7
             AND repeat_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]))
        AND (repeat_every IS DISTINCT FROM 'month' OR repeat_date BETWEEN 1 AND 28)
        AND (ends_on IS NULL OR (starts_on IS NOT NULL AND ends_on >= starts_on))
    ),
    CONSTRAINT message_automation_next_run_ck CHECK (status = 'active' OR next_run_at IS NULL),
    CONSTRAINT message_automation_version_check CHECK (version >= 1)
);
CREATE INDEX message_automation_due_idx ON public.message_automation (next_run_at) WHERE status = 'active';
CREATE INDEX message_automation_list_idx ON public.message_automation (created_at DESC, id DESC);

CREATE TABLE public.message_automation_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    automation_id uuid NOT NULL REFERENCES public.message_automation(id) ON DELETE CASCADE,
    ran_at timestamp with time zone DEFAULT now() NOT NULL,
    matched integer DEFAULT 0 NOT NULL,
    message_id uuid,
    outcome text NOT NULL,
    CONSTRAINT message_automation_run_matched_check CHECK (matched >= 0),
    CONSTRAINT message_automation_run_outcome_check CHECK (outcome = ANY (ARRAY['sent_to_message', 'nobody', 'waited'])),
    CONSTRAINT message_automation_run_message_ck CHECK ((outcome = 'sent_to_message') = (message_id IS NOT NULL))
);
CREATE INDEX message_automation_run_idx ON public.message_automation_run (automation_id, ran_at DESC);

CREATE TABLE public.message_automation_recipient (
    automation_id uuid NOT NULL REFERENCES public.message_automation(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE,
    occurrence_key text NOT NULL,
    run_id uuid NOT NULL REFERENCES public.message_automation_run(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_automation_recipient_once UNIQUE (automation_id, customer_id, occurrence_key)
);
CREATE INDEX message_automation_recipient_run_idx ON public.message_automation_recipient (run_id);
CREATE INDEX message_automation_recipient_customer_idx ON public.message_automation_recipient (customer_id);

CREATE TABLE public.message_automation_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    automation_id uuid NOT NULL REFERENCES public.message_automation(id) ON DELETE CASCADE,
    kind text NOT NULL,
    actor_sub text NOT NULL,
    facts jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_automation_event_kind_check CHECK (kind = ANY (ARRAY[
        'created', 'edited', 'paused', 'resumed', 'ended', 'finished'])),
    CONSTRAINT message_automation_event_facts_check CHECK (jsonb_typeof(facts) = 'object')
);
CREATE INDEX message_automation_event_idx ON public.message_automation_event (automation_id, created_at DESC);

ALTER TABLE public.message ADD COLUMN email boolean DEFAULT false NOT NULL;
ALTER TABLE public.message ADD COLUMN name_fallback text DEFAULT 'there' NOT NULL;
ALTER TABLE public.message ADD COLUMN automation_id uuid REFERENCES public.message_automation(id) ON DELETE SET NULL;
ALTER TABLE public.message ADD CONSTRAINT message_fallback_check
    CHECK (char_length(name_fallback) BETWEEN 1 AND 20 AND name_fallback !~ '[{}]');
ALTER TABLE public.message ADD CONSTRAINT message_title_name_check CHECK (title NOT ILIKE '%{first name%');
CREATE INDEX message_automation_idx ON public.message (automation_id) WHERE automation_id IS NOT NULL;

ALTER TABLE public.customer_marketing_consent ADD COLUMN message_id uuid REFERENCES public.message(id) ON DELETE SET NULL;
CREATE INDEX customer_marketing_consent_message_idx ON public.customer_marketing_consent (message_id) WHERE message_id IS NOT NULL;

-- Staff tables: written by the admin service and the notifications worker (owner role); shoppers never see them.
REVOKE ALL ON TABLE public.message_automation FROM effy_shopper;
REVOKE ALL ON TABLE public.message_automation_run FROM effy_shopper;
REVOKE ALL ON TABLE public.message_automation_recipient FROM effy_shopper;
REVOKE ALL ON TABLE public.message_automation_event FROM effy_shopper;

-- +goose Down
DROP INDEX public.customer_marketing_consent_message_idx;
ALTER TABLE public.customer_marketing_consent DROP COLUMN message_id;

DROP INDEX public.message_automation_idx;
ALTER TABLE public.message DROP CONSTRAINT message_title_name_check;
ALTER TABLE public.message DROP CONSTRAINT message_fallback_check;
ALTER TABLE public.message DROP COLUMN automation_id;
ALTER TABLE public.message DROP COLUMN name_fallback;
ALTER TABLE public.message DROP COLUMN email;

DROP TABLE public.message_automation_event;
DROP TABLE public.message_automation_recipient;
DROP TABLE public.message_automation_run;
DROP TABLE public.message_automation;

ALTER TABLE public.customer DROP CONSTRAINT customer_email_unsubscribe_token_check;
ALTER TABLE public.customer DROP CONSTRAINT customer_email_unsubscribe_token_key;
ALTER TABLE public.customer DROP COLUMN email_unsubscribe_token;

UPDATE public.notification_delivery SET not_before = NULL WHERE channel <> 'push' AND not_before IS NOT NULL;
ALTER TABLE public.notification_delivery DROP CONSTRAINT notification_delivery_not_before_ck;
ALTER TABLE public.notification_delivery ADD CONSTRAINT notification_delivery_not_before_ck
    CHECK (not_before IS NULL OR channel = 'push');

DROP VIEW public.marketing_email_consent_current;
CREATE OR REPLACE VIEW public.marketing_consent_current AS
    SELECT DISTINCT ON (customer_id, category)
           customer_id, category, granted, surface, via, wording_version, created_at
      FROM public.customer_marketing_consent
     ORDER BY customer_id, category, created_at DESC, id DESC;

DROP INDEX public.customer_marketing_consent_latest_idx;
CREATE INDEX customer_marketing_consent_latest_idx
    ON public.customer_marketing_consent (customer_id, category, created_at DESC);

-- Email answers and answers from an email exist only since 115: the append-only record loses them on the way down.
DELETE FROM public.customer_marketing_consent WHERE channel = 'email' OR surface = 'email' OR via IN ('email_link', 'one_click');
ALTER TABLE public.customer_marketing_consent DROP CONSTRAINT customer_marketing_consent_via_check;
ALTER TABLE public.customer_marketing_consent ADD CONSTRAINT customer_marketing_consent_via_check
    CHECK (via = ANY (ARRAY['prompt', 'settings', 'inbox']));
ALTER TABLE public.customer_marketing_consent DROP CONSTRAINT customer_marketing_consent_surface_check;
ALTER TABLE public.customer_marketing_consent ADD CONSTRAINT customer_marketing_consent_surface_check
    CHECK (surface = ANY (ARRAY['app', 'web']));
ALTER TABLE public.customer_marketing_consent DROP CONSTRAINT customer_marketing_consent_channel_check;
ALTER TABLE public.customer_marketing_consent DROP COLUMN channel;

DELETE FROM public.customer_notification_choice WHERE surface = 'email' OR (category IN ('offers', 'news') AND channel <> 'push');
ALTER TABLE public.customer_notification_choice DROP CONSTRAINT customer_notification_choice_surface_check;
ALTER TABLE public.customer_notification_choice ADD CONSTRAINT customer_notification_choice_surface_check
    CHECK (surface = ANY (ARRAY['app', 'web']));
ALTER TABLE public.customer_notification_choice ADD CONSTRAINT customer_notification_choice_channel_ck
    CHECK (category <> ALL (ARRAY['offers', 'news']) OR channel = 'push');
