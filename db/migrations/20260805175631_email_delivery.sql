-- +goose Up
-- 037-platform-email-delivery: the platform's record of which addresses it can actually reach.
--
-- WHY THIS MIGRATION EXISTS AT ALL
--
-- ⚠ When an address hard-fails once, the mail service records it and thereafter ACCEPTS every send
-- and delivers nothing. The caller gets a success response and a message id. The sign-in screen
-- says "we've sent you a code." No code will ever arrive again.
--
-- On this platform that is not a deliverability statistic — it is a permanent account lockout. For
-- driver, shop and back-office an emailed code is the ONLY credential; there is no password and no
-- federated route. And no alarm fires, because a single address never moves a rate. Before these
-- tables the platform had no way to learn which address failed, no way for an operator to see it,
-- and no way to put it right.
--
-- ⚠ KEYED BY ADDRESS, NOT BY PERSON — deliberately (plan research R8).
-- A delivery outcome carries an address, not an identity. Keying by person would mean writing to
-- three tables with three different email column shapes (public.customer.email is
-- `citext NOT NULL UNIQUE`; public.shop_staff.email is nullable `text` with no index;
-- admin.staff.email is `text NOT NULL` with no index) — and would leave NOWHERE AT ALL to record a
-- driver's outcome, since the driver audience has a Cognito pool and still has no platform table.
-- It would also have nothing to write when an address fails before its account exists or after it
-- is deleted. The per-person answer is derived by join; the store is address-shaped because the
-- event is.

CREATE TABLE public.email_delivery_status (
    address         citext PRIMARY KEY,
    raw_address     text NOT NULL,
    state           text NOT NULL DEFAULT 'reachable'
                      CHECK (state IN ('reachable', 'soft_failing', 'undeliverable', 'complained')),
    reason          text,
    diagnostic      text,
    last_event_at   timestamptz NOT NULL,
    last_message_id text,
    bounce_count    integer NOT NULL DEFAULT 0,
    complaint_count integer NOT NULL DEFAULT 0,
    repaired_at     timestamptz,
    repaired_by     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_delivery_status IS
    '037 — the current conclusion about whether the platform can reach each address. One row per address ever heard about; rows appear on the first OUTCOME, never at sign-up.';

COMMENT ON COLUMN public.email_delivery_status.address IS
    '037 — the lookup key, citext to match public.customer.email. Cognito treats email as a case-insensitive sign-in alias, so the join must agree.';

-- ⚠ THE MOST LIKELY WAY THIS FEATURE SHIPS BROKEN.
COMMENT ON COLUMN public.email_delivery_status.raw_address IS
    '037 FR-035 — the address EXACTLY as the mail service reported it, case preserved. The suppression-management API is CASE-SENSITIVE: User@Example.com and user@example.com are one address for sending but require an exact case match to delete. A repair that normalises case silently fails to remove an entry that demonstrably exists, and the operator believes they fixed something they did not. This column, never the lookup key, is what the repair calls the mail service with.';

COMMENT ON COLUMN public.email_delivery_status.state IS
    '037 — reachable | soft_failing | undeliverable | complained. Only a PERMANENT failure reaches undeliverable (FR-029); an outcome the mail service could not classify is treated as transient, because marking someone undeliverable on a guess locks them out on a guess.';

COMMENT ON COLUMN public.email_delivery_status.diagnostic IS
    '037 — the receiving server''s own rejection text. Stored because an operator needs it to judge whether a repair is worth attempting. NEVER LOGGED and never returned to the account owner: it contains the address, and it is written for a postmaster.';

COMMENT ON COLUMN public.email_delivery_status.complaint_count IS
    '037 FR-031 — kept SEPARATE from bounce_count. A complaint means the mail arrived and the person marked it spam, usually because someone typed a stranger''s address into sign-in. It is recorded and surfaced but MUST NOT bar anyone from signing in to their own account.';

COMMENT ON COLUMN public.email_delivery_status.repaired_at IS
    '037 — set by the operator repair; CLEARED BY ANY SUBSEQUENT FAILURE. A stale "repaired" stamp beside a broken address is the kind of half-truth that makes an operator stop trusting the screen.';

-- The only list anyone asks for is "who is currently broken", which is a small subset of an already
-- small table. No index on address — the primary key covers it.
CREATE INDEX email_delivery_status_attention_idx
    ON public.email_delivery_status (last_event_at DESC)
    WHERE state <> 'reachable';

-- ⚠ NO FOREIGN KEY to public.customer / public.shop_staff / admin.staff, deliberately.
-- An address can fail before its account exists, after it is deleted, or for an audience with no
-- platform table at all. A foreign key would make exactly those events unrecordable — which is
-- precisely the blindness this feature exists to end.

CREATE TABLE public.email_delivery_event (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    address     citext NOT NULL,
    raw_address text NOT NULL,
    event_type  text NOT NULL
                  CHECK (event_type IN ('bounce', 'complaint', 'delivery', 'reject', 'delivery_delay')),
    sub_type    text,
    reason      text,
    message_id  text NOT NULL,
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_delivery_event IS
    '037 — the append-only log of every outcome, kept whether or not it changed the conclusion. This is what makes "when did this start?" answerable.';

COMMENT ON COLUMN public.email_delivery_event.occurred_at IS
    '037 — the mail service''s own timestamp, not ours. Outcomes arrive out of order, so the consumer compares this against status.last_event_at before advancing state: a Delivery for an OLDER message must not resurrect an address that has since bounced.';

-- ⚠ IDEMPOTENCY (FR-028). Outcome publication is explicitly at-least-once, unordered, and may
-- duplicate. The consumer inserts ON CONFLICT DO NOTHING and updates the status row ONLY when a row
-- was actually inserted — otherwise a redelivered bounce increments bounce_count twice and a
-- redelivered complaint inflates the number an operator is reading to make a decision.
--
-- ⚠ Keyed on all three columns, not message_id alone: one message legitimately produces several
-- events (delivery_delay then bounce; delivery then complaint) and may name several recipients.
CREATE UNIQUE INDEX email_delivery_event_idem_idx
    ON public.email_delivery_event (message_id, event_type, address);

CREATE INDEX email_delivery_event_address_idx
    ON public.email_delivery_event (address, occurred_at DESC);

-- +goose Down
DROP TABLE IF EXISTS public.email_delivery_event;
DROP TABLE IF EXISTS public.email_delivery_status;
