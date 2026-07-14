-- +goose Up
-- 012-customer-profile-management: the platform's own record of a customer's PASSWORD STATE.
--
-- WHY THE DATABASE HAS TO HOLD THIS AT ALL
--
-- Because Cognito cannot be asked. There is NO API that reports whether a user has a password:
-- `AdminGetUser` does not return it, and `UserStatus` does not distinguish it — a passwordless
-- CONFIRMED user and an email+password CONFIRMED user are IDENTICAL on the wire. The platform must
-- therefore remember, which is what turns FR-013 from a query into a column.
--
-- And that forces a consequence worth stating out loud, because it shaped the whole slice: EVERY
-- PATH THAT ESTABLISHES A PASSWORD MUST GO THROUGH THE PLATFORM, or this column silently goes
-- wrong. That is exactly why account recovery ("forgot password") was pulled behind the backend in
-- this slice (FR-022b) — it sets a password, and it used to do so entirely client-side, where the
-- platform never found out.

ALTER TABLE public.customer
    ADD COLUMN has_password        boolean     NOT NULL DEFAULT false,
    ADD COLUMN password_updated_at timestamptz;

COMMENT ON COLUMN public.customer.has_password IS
    'Does this account have a password? PLATFORM-OWNED — Cognito cannot be asked (012 FR-013). Decides which control the account page offers. NEVER inferred from the sign-in route: a Google-LINKED customer is a native user and CAN hold a password.';

COMMENT ON COLUMN public.customer.password_updated_at IS
    'When the password last changed. NULL means NEVER — a legitimate, permanent state for an email-OTP customer, not a missing value (012 FR-015).';

-- ⚠ `false` IS THE SAFE DEFAULT, and the asymmetry is deliberate.
--
--   Wrongly marked "no password"  → the customer is offered the SET flow, which is gated behind a
--                                   fresh code emailed to their verified address. Strictly harder.
--   Wrongly marked "has password" → the customer is offered the CHANGE flow, which demands a
--                                   current password they do not have. They are merely STUCK, and
--                                   recover via "forgot password".
--
-- Neither error grants a capability. Defaulting to `false` picks the one that fails safe.
--
-- NO BACKFILL. There is nothing to backfill FROM — the answer is not knowable for an existing row,
-- and `public.customer` has no rows in dev anyway (per 011's own migration note). Every row's true
-- value is established from this point forward by the platform's own writes.
--
-- NO INDEX. Neither column is ever a predicate; they are read only on the single-row lookup by
-- `cognito_sub`, which is already unique-indexed.

-- +goose Down
ALTER TABLE public.customer
    DROP COLUMN has_password,
    DROP COLUMN password_updated_at;
