-- 046-customer-feedback — feedback submissions, staff replies, internal notes.
--
-- A listening channel: a shopper (guest or signed-in) tells Effy something; staff read, triage, and
-- reply. Three tables in `public` — the submission is customer-authored operational data, written by
-- the public customer service and read by the admin console (both reach `public`).
--
-- ⚠ IMMUTABLE CONTEXT vs MUTABLE STAFF FIELDS (spec FR-040). Once a submission is written, its
-- context NEVER changes: category, message, rating, submitter identity (as recorded), source,
-- platform, customer_id, email_verified. The ONLY mutable parts are `status` (a staff triage state)
-- and the append-only `feedback_reply` / `feedback_note` child rows. Immutability is enforced by
-- repository discipline — no UPDATE path touches the frozen columns — not by a trigger (consistent
-- with the platform's other tables; C1). A BEFORE UPDATE guard is the escalation if it must be mechanical.
--
-- ⚠ NO CROSS-SCHEMA FK TO admin.staff. Staff attribution on replies/notes is a plain `staff_sub`
-- text column (+ a name snapshot), the same posture deliverability's repair takes for its actor.
-- `public` does not FK into `admin` — the two schemas have different lifecycles and access paths.
--
-- ⚠ Length bounds mirror packages/shared-types/src/feedback.ts (FEEDBACK_MESSAGE_MAX 5000,
-- FEEDBACK_REPLY_MAX 5000, FEEDBACK_NOTE_MAX 2000). One source; the CHECK and the service agree.
--
-- Forward-only (003). The Down drops the tables — dev-only, single-step.

-- +goose Up

-- Case-insensitive email, enforced by the TYPE (the newsletter/customer posture). A guest and a
-- customer who type the same address in different case are one addressee.
CREATE EXTENSION IF NOT EXISTS citext;
-- Trigram search over the message body (FR-019), the same extension the storefront search uses.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.feedback_submission (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ⚠ OPAQUE, NOT SEQUENTIAL. Shown to the shopper on the confirmation and carried in both emails so
    -- a person and staff can name one submission. Generated in the service (research D10); not a
    -- running count (which would be an enumeration oracle).
    reference_code   text NOT NULL UNIQUE,

    category         text NOT NULL
                     CHECK (category IN ('bug', 'suggestion', 'complaint', 'compliment', 'other')),

    -- Stored RAW; rendered inert (escaped) in every sink — console and email (FR-017).
    message          text NOT NULL
                     CHECK (char_length(btrim(message)) BETWEEN 1 AND 5000),

    rating           smallint CHECK (rating BETWEEN 1 AND 5),

    submitter_name   text,
    -- ⚠ UNVERIFIED for guests; a verified customer's is trusted. Drives whether a thank-you / reply is
    -- even possible. citext so `A@b.com` and `a@b.com` are one addressee.
    submitter_email  citext,
    -- true ONLY when set from an authenticated customer profile (the authed submit route).
    email_verified   boolean NOT NULL DEFAULT false,

    -- Linked ONLY via the authenticated route; NULL = guest. The row survives account deletion.
    customer_id      uuid REFERENCES public.customer(id) ON DELETE SET NULL,

    source           text NOT NULL DEFAULT 'general'
                     CHECK (source IN ('checkout', 'general', 'other')),
    platform         text NOT NULL
                     CHECK (platform IN ('web', 'ios', 'android')),

    status           text NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'in_review', 'replied', 'resolved', 'archived', 'spam')),

    -- ⚠ A HASH of the rate-limit source (authenticated sub, else the request source IP), NEVER the raw
    -- IP (PII). Only the cooldown window reads it (research D5).
    source_key       text,

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Default list order (newest-first) and the rate-limit window both read created_at.
CREATE INDEX feedback_submission_created_idx ON public.feedback_submission (created_at DESC);
-- Console filters.
CREATE INDEX feedback_submission_status_idx   ON public.feedback_submission (status);
CREATE INDEX feedback_submission_category_idx ON public.feedback_submission (category);
-- Full-text search over the message (FR-019).
CREATE INDEX feedback_submission_message_trgm_idx
    ON public.feedback_submission USING gin (message gin_trgm_ops);
-- Email search (FR-019) + the guest-vs-customer joins.
CREATE INDEX feedback_submission_email_idx ON public.feedback_submission (submitter_email);
-- The per-source cooldown window (D5): count recent rows for one source.
CREATE INDEX feedback_submission_source_key_idx
    ON public.feedback_submission (source_key, created_at DESC)
    WHERE source_key IS NOT NULL;

CREATE TABLE public.feedback_reply (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES public.feedback_submission(id) ON DELETE CASCADE,

    body          text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),

    -- The replying back-office subject; no cross-schema FK (see header). Name snapshotted at send.
    staff_sub     text NOT NULL,
    staff_name    text,

    -- Recorded ONLY after a successful SEND (FR-029/030). A send failure writes nothing.
    sent_at       timestamptz NOT NULL DEFAULT now(),
    -- Synchronous send outcome. ⚠ An async hard-bounce arriving later is NOT tracked here — bounce
    -- visibility lives in the 037 deliverability path; this is a hook for a later reconciliation (G1).
    delivery_ok   boolean NOT NULL DEFAULT true
);

CREATE INDEX feedback_reply_submission_idx ON public.feedback_reply (submission_id, sent_at);

CREATE TABLE public.feedback_note (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES public.feedback_submission(id) ON DELETE CASCADE,

    -- ⚠ STAFF-ONLY. Never emailed, never shown to the submitter (FR-024/FR-038).
    body          text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),

    staff_sub     text NOT NULL,
    staff_name    text,

    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_note_submission_idx ON public.feedback_note (submission_id, created_at);

COMMENT ON TABLE  public.feedback_submission IS
    'Customer feedback (046). Context columns are immutable; only status + child reply/note rows change.';
COMMENT ON COLUMN public.feedback_submission.reference_code IS
    'Opaque, non-sequential public reference (FB-XXXXXX). Shown to the shopper and in both emails.';
COMMENT ON COLUMN public.feedback_submission.source_key IS
    'Hash of the rate-limit source (sub or request IP). Never the raw IP. Cooldown window only (D5).';
COMMENT ON COLUMN public.feedback_submission.email_verified IS
    'true only when submitter_email came from an authenticated customer profile.';
COMMENT ON TABLE  public.feedback_reply IS
    'Staff replies emailed to the submitter (046). One row per successful send; append-only.';
COMMENT ON TABLE  public.feedback_note IS
    'Staff-only annotations on a submission (046). Never emailed, never submitter-visible.';

-- +goose Down
DROP TABLE IF EXISTS public.feedback_note;
DROP TABLE IF EXISTS public.feedback_reply;
DROP TABLE IF EXISTS public.feedback_submission;
