-- +goose Up
-- 034-customer-account-center: a self-asserted PHONE on the customer record, and the CLOSURE state
-- that makes in-app account deletion possible.
--
-- WHY THIS MIGRATION EXISTS AT ALL
--
-- Apple has required in-app account deletion since 30 June 2022, and Google Play requires it in two
-- places (an in-app path AND a public web URL declared in the Data safety form). Effy's customer app
-- has open self-registration, so both rules bite — and neither is satisfiable today, because
-- `public.customer` has no deletion concept of ANY kind: no closure state, no request record, no
-- path. The mobile apps are unpublishable until this exists.

-- ── The phone ─────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.customer
    ADD COLUMN phone text;

COMMENT ON COLUMN public.customer.phone IS
    'Self-asserted contact phone (034 FR-060). ⚠ NEVER VERIFIED by this feature — it MUST NOT be shown with a confirmation indicator and MUST NOT be accepted by any identity, recovery or authentication path (FR-060a). Distinct from public.customer_address.phone, which is the per-address DELIVERY contact a driver calls (FR-060b).';

-- ⚠ THERE IS DELIBERATELY NO `phone_verified` COLUMN.
--
-- Adding one would invite exactly the tick FR-060a forbids, and a column whose only honest value is
-- `false` is a trap for the next feature — someone will eventually render it as a badge. When phone
-- verification is genuinely built, it arrives WITH its own challenge flow and this comment goes.
--
-- NO FORMAT CHECK either. Effy serves one market today, but a strict pattern is a support burden
-- that buys nothing while the value is unverified and non-authoritative. Stored as entered, trimmed.

-- ── Closure state ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.customer
    ADD COLUMN closure_state text NOT NULL DEFAULT 'open'
        CHECK (closure_state IN ('open', 'closing'));

COMMENT ON COLUMN public.customer.closure_state IS
    'Has this customer asked to be deleted? (034 FR-041.) ⚠ DELIBERATELY NOT a third value of `status`: `status` is a PLATFORM SANCTION whose safety property is that the customer cannot influence it, whereas closure is the customer''s OWN decision. Two values only — there is no ''closed'', because after erasure the row is GONE.';

-- ⚠⚠ `closure_state` MUST NEVER ENTER THE JIT UPSERT'S `ON CONFLICT DO UPDATE` CLAUSE. ⚠⚠
--
-- This is the same trap `status` carries, and `apis/edge-api/customer/src/customer/repo.ts:17-39`
-- already explains it at length. The failure mode here is the mirror image: the INSERT supplies the
-- column default ('open'), so a conflict path that wrote `closure_state = EXCLUDED.closure_state`
-- would SILENTLY UN-DELETE AN ACCOUNT THE MOMENT ITS OWNER — OR ANYONE HOLDING THEIR TOKEN — MADE
-- ANY AUTHENTICATED REQUEST. No error, no log, and it would read as a harmless tidy-up in review.
--
-- Restore is an EXPLICIT, AUDITED write (FR-041a), never a side effect of authenticating.
--
-- ⚠ AND THIS IS NOT A `deleted_at`, ON PURPOSE.
--
-- `20260802052141_customer_saved_items.sql` records why that pattern was rejected before: "a
-- `deleted_at` column would put a predicate on every read that someone will eventually forget."
-- Closure is checked at exactly TWO gates — the cold path's `assertActive` and the hot path's
-- `customeridentity` — not scattered across every query.

-- ── The closure request ───────────────────────────────────────────────────────────────────────

CREATE TABLE public.customer_closure_request (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         uuid        NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,

    requested_at        timestamptz NOT NULL DEFAULT now(),
    erase_after         timestamptz NOT NULL,

    verification_method text        NOT NULL
                                    CHECK (verification_method IN ('email_code')),

    cancelled_at        timestamptz,
    cancelled_reason    text        CHECK (cancelled_reason IN ('restored_by_customer')),

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_closure_request IS
    'One row per account-closure request (034 US3). Retained after the request resolves: "did this person ask to be deleted, when, and what proved it?" is a question the platform must be able to answer afterwards.';

COMMENT ON COLUMN public.customer_closure_request.erase_after IS
    'When erasure becomes irreversible. ⚠ STORED, NOT DERIVED — requested_at + 30 days is trivially computable, but this exact date is DISCLOSED TO THE CUSTOMER (FR-040) and SC-010 requires every claim in that disclosure to be true. Deriving it would retroactively move the deadline for people already told a different one if the window is ever changed. It is also the erasure job''s indexable selection column.';

COMMENT ON COLUMN public.customer_closure_request.verification_method IS
    'What proved control of the account (FR-043). Only ''email_code'' today — the token-authorized emailed-code pair 012 already built, which works for EVERY credential route including a federated-only account. A password prompt here would be an unresolvable dead end for a Google-only customer.';

-- ⚠ At most ONE live request per customer. A double submission must not be able to create two
-- windows with two different erase dates — one of which the customer was told and the other of
-- which the erasure job would act on. Making that unrepresentable in the schema is cheaper and more
-- durable than defending it in the service.
CREATE UNIQUE INDEX customer_closure_request_live_idx
    ON public.customer_closure_request (customer_id)
    WHERE cancelled_at IS NULL;

-- The erasure job (a LATER SLICE — deliberately not built here) selects on this.
CREATE INDEX customer_closure_request_erase_after_idx
    ON public.customer_closure_request (erase_after)
    WHERE cancelled_at IS NULL;

-- ⚠ PERMANENT ERASURE IS NOT BUILT BY THIS FEATURE, AND THAT HAS A CONSEQUENCE.
--
-- Until the erasure slice ships, a customer told "permanently deleted after 30 days" will, on day
-- 31, still have a row. THESE APPS MUST NOT BE SUBMITTED TO EITHER STORE until it lands — the
-- disclosure is a promise the platform cannot yet keep. Tracked as 034 FR-041 / SC-011.

-- +goose Down
DROP TABLE IF EXISTS public.customer_closure_request;

ALTER TABLE public.customer
    DROP COLUMN IF EXISTS closure_state,
    DROP COLUMN IF EXISTS phone;
