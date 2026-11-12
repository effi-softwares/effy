-- 113 Data lifecycle (specs/113-data-lifecycle).
--
-- • order: a sixth ending, `abandoned` - an order nobody paid for, closed by the unpaid-orders clean-up (commerce) or by
--   closing the account (customer), only through `finalizeAbandoned` (@effy/edge-shared/payments). "Placed" is
--   `placed_at IS NOT NULL` (PLACED_ORDER_SQL), so the new status counts as an order nowhere.
-- • refund: kind `unplaced` / reason `order_abandoned` - a payment that arrived for an order already closed, returned
--   in full by the system.
-- • customer: `erased` - a kept, empty row (orders, points and refunds still point at it); email, names, phone and the
--   provider reference are NULL. `matches_erased_barred_on`: a new registration matched a barred, erased account.
-- • customer_closure_request.erased_at: the record that the deletion was carried out (FR-018).
-- • erased_barred_fingerprint: keyed digests of a barred account's email and phone, nothing else (FR-016).
-- • housekeeping_run (append-only, one writer: recordRun), housekeeping_settings (+ _change): what staff see on
--   Settings › Clean-ups.
-- Additive: code from before 113 never writes the new values, and every CHECK only widens.

-- +goose Up
ALTER TABLE public."order" DROP CONSTRAINT order_status_check;
ALTER TABLE public."order" ADD CONSTRAINT order_status_check
    CHECK (status = ANY (ARRAY['pending_payment', 'paid', 'failed', 'canceled', 'abandoned']));
CREATE INDEX order_unpaid_idx ON public."order" (updated_at) WHERE status = 'pending_payment';

ALTER TABLE public.refund DROP CONSTRAINT refund_kind_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_kind_check
    CHECK (kind = ANY (ARRAY['item', 'goodwill', 'cancellation', 'external', 'delivery', 'unplaced']));
ALTER TABLE public.refund DROP CONSTRAINT refund_reason_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_reason_check
    CHECK (reason = ANY (ARRAY['item_not_supplied', 'item_unusable', 'order_cancelled', 'goodwill', 'external',
                               'courier_override', 'order_abandoned']));
ALTER TABLE public.refund ADD CONSTRAINT refund_unplaced_ck
    CHECK ((kind = 'unplaced') = (reason = 'order_abandoned') AND (kind <> 'unplaced' OR actor_kind = 'system'));

ALTER TABLE public.customer DROP CONSTRAINT customer_closure_state_check;
ALTER TABLE public.customer ADD CONSTRAINT customer_closure_state_check
    CHECK (closure_state = ANY (ARRAY['open', 'closing', 'erased']));
ALTER TABLE public.customer ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.customer ADD COLUMN erased_at timestamp with time zone;
ALTER TABLE public.customer ADD COLUMN matches_erased_barred_on date;
ALTER TABLE public.customer ADD CONSTRAINT customer_erased_ck CHECK (
    (closure_state = 'erased') = (email IS NULL)
    AND (closure_state <> 'erased'
         OR (given_name IS NULL AND family_name IS NULL AND phone IS NULL AND stripe_customer_id IS NULL)));
ALTER TABLE public.customer ADD CONSTRAINT customer_erased_at_ck
    CHECK ((closure_state = 'erased') = (erased_at IS NOT NULL));

ALTER TABLE public.customer_closure_request ADD COLUMN erased_at timestamp with time zone;
ALTER TABLE public.customer_closure_request ADD CONSTRAINT customer_closure_request_erased_ck
    CHECK (erased_at IS NULL OR cancelled_at IS NULL);
CREATE INDEX closure_due_idx ON public.customer_closure_request (erase_after)
    WHERE cancelled_at IS NULL AND erased_at IS NULL;

CREATE TABLE public.erased_barred_fingerprint (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    kind text NOT NULL,
    digest bytea NOT NULL,
    erased_at date NOT NULL,
    CONSTRAINT erased_barred_fingerprint_kind_check CHECK (kind = ANY (ARRAY['email', 'phone'])),
    CONSTRAINT erased_barred_fingerprint_key UNIQUE (kind, digest)
);

CREATE TABLE public.housekeeping_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    job text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone NOT NULL,
    outcome text NOT NULL,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    problem text,
    CONSTRAINT housekeeping_run_job_check
        CHECK (job = ANY (ARRAY['unpaid_orders', 'account_erasure', 'phone_registrations'])),
    CONSTRAINT housekeeping_run_outcome_check CHECK (outcome = ANY (ARRAY['ok', 'partial', 'failed'])),
    CONSTRAINT housekeeping_run_times_ck CHECK (finished_at >= started_at),
    CONSTRAINT housekeeping_run_counts_ck CHECK (jsonb_typeof(counts) = 'object'),
    CONSTRAINT housekeeping_run_problem_ck CHECK ((outcome = 'ok') = (problem IS NULL))
);
CREATE INDEX housekeeping_run_job_idx ON public.housekeeping_run (job, started_at DESC);

CREATE TABLE public.housekeeping_settings (
    id integer DEFAULT 1 NOT NULL PRIMARY KEY,
    abandon_after_min integer DEFAULT 1440 NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT housekeeping_settings_id_check CHECK (id = 1),
    CONSTRAINT housekeeping_settings_abandon_check CHECK (abandon_after_min BETWEEN 60 AND 10080)
);
INSERT INTO public.housekeeping_settings (id, updated_by) VALUES (1, 'migration');

CREATE TABLE public.housekeeping_settings_change (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    field text NOT NULL,
    old_value text NOT NULL,
    new_value text NOT NULL,
    changed_by text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Shoppers' role: commerce records unpaid-order runs (INSERT only); nothing else here is theirs.
REVOKE ALL ON TABLE public.erased_barred_fingerprint FROM effy_shopper;
REVOKE UPDATE, DELETE ON TABLE public.housekeeping_run FROM effy_shopper;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.housekeeping_settings FROM effy_shopper;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.housekeeping_settings_change FROM effy_shopper;

-- +goose Down
DROP TABLE public.housekeeping_settings_change;
DROP TABLE public.housekeeping_settings;
DROP TABLE public.housekeeping_run;
DROP TABLE public.erased_barred_fingerprint;

DROP INDEX public.closure_due_idx;
ALTER TABLE public.customer_closure_request DROP CONSTRAINT customer_closure_request_erased_ck;
ALTER TABLE public.customer_closure_request DROP COLUMN erased_at;

-- An erased row needs an address again; the reserved .invalid domain can never reach anyone.
UPDATE public.customer SET email = 'erased-' || id || '@erased.invalid' WHERE email IS NULL;
UPDATE public.customer SET closure_state = 'closing' WHERE closure_state = 'erased';
ALTER TABLE public.customer DROP CONSTRAINT customer_erased_at_ck;
ALTER TABLE public.customer DROP CONSTRAINT customer_erased_ck;
ALTER TABLE public.customer DROP COLUMN matches_erased_barred_on;
ALTER TABLE public.customer DROP COLUMN erased_at;
ALTER TABLE public.customer ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.customer DROP CONSTRAINT customer_closure_state_check;
ALTER TABLE public.customer ADD CONSTRAINT customer_closure_state_check
    CHECK (closure_state = ANY (ARRAY['open', 'closing']));

ALTER TABLE public.refund DROP CONSTRAINT refund_unplaced_ck;
UPDATE public.refund SET kind = 'external', reason = 'external', note = COALESCE(note, 'Paid after the order closed (113)')
 WHERE kind = 'unplaced';
ALTER TABLE public.refund DROP CONSTRAINT refund_reason_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_reason_check
    CHECK (reason = ANY (ARRAY['item_not_supplied', 'item_unusable', 'order_cancelled', 'goodwill', 'external',
                               'courier_override']));
ALTER TABLE public.refund DROP CONSTRAINT refund_kind_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_kind_check
    CHECK (kind = ANY (ARRAY['item', 'goodwill', 'cancellation', 'external', 'delivery']));

DROP INDEX public.order_unpaid_idx;
UPDATE public."order" SET status = 'failed' WHERE status = 'abandoned';
ALTER TABLE public."order" DROP CONSTRAINT order_status_check;
ALTER TABLE public."order" ADD CONSTRAINT order_status_check
    CHECK (status = ANY (ARRAY['pending_payment', 'paid', 'failed', 'canceled']));
