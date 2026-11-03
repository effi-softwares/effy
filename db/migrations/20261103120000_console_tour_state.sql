-- Guided tours (106): which console tours a person has been offered, so a tour is offered once per person on any
-- device, and whether they want tours offered at all. One row per (audience, subject): `audience` is set by the
-- service that owns the console ('shop' by the shop service, 'admin' by the admin service), `subject` is the
-- caller's own Cognito sub. A person's UI preference, not a business record: no foreign key, not audited.
-- `seen` maps a tour key to { "v": version, "outcome": finished|closed|declined, "at": timestamp }. Its one reader
-- and writer is @effy/edge-shared/tours (store.ts).

-- +goose Up
CREATE TABLE public.console_tour_state (
    audience text NOT NULL,
    subject text NOT NULL,
    offer_tours boolean DEFAULT true NOT NULL,
    seen jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT console_tour_state_pkey PRIMARY KEY (audience, subject),
    CONSTRAINT console_tour_state_audience_check CHECK (audience = ANY (ARRAY['shop'::text, 'admin'::text])),
    CONSTRAINT console_tour_state_seen_check CHECK (jsonb_typeof(seen) = 'object'::text)
);
