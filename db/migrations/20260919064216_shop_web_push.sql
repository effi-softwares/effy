-- +goose Up
-- 059-shop-web-pwa — let a browser be a push destination, and remember when attention began.
--
-- Four additive changes. Nothing is dropped, no existing row is rewritten, and every pre-059 row
-- stays valid with the behaviour it had.
--
--   1. device_token.platform      gains 'web'          ← THE DEFECT FIX
--   2. notification_request.type  gains four attention kinds
--   3. device_token.muted_types   per-registration notification preferences
--   4. public.shop_attention_state  NEW — when an attention condition began
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ WHY (1) IS A DEFECT FIX AND NOT A FEATURE
--
-- Since 050, `core-api` has enqueued one `shop_new_order` notification intent per ACTIVE STAFF
-- MEMBER of every fulfilling shop, on every paid order (checkout/store.go:621). The worker resolves
-- those intents to rows in `device_token`. A browser could not be one of those rows, because this
-- CHECK forbade it — and the shop audience works in a WEB console, not the mobile app.
--
-- So the decision to notify has been made, stored and attempted for every order since 050, and
-- discarded every time as "nobody to send to" (status = 'skipped'). This one line is the whole of
-- what stood between a paid order and the shop being told.
--
-- ⚠ NO BACKFILL, DELIBERATELY. The accumulated `skipped` rows are a historical record of a real
-- defect, not a queue to replay. Re-sending them would notify operators about orders picked weeks
-- ago. They stay as they are.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ READER AUDIT — RUN BEFORE THIS WIDENING, NOT AFTER (059 T009/T010)
--
-- 053 and 056 each SHIPPED a defect through an enum widening, and 057 records the pattern a third
-- time. So every reader of both columns was enumerated first. The results:
--
-- `device_token.platform` — FOUR readers, one more than the plan's research had found:
--   a) apis/edge-api/shared/src/lib/devices.ts — validates against DEVICE_PLATFORMS. WIDENED.
--   b) …/devices.ts `RecipientToken.platform` — carried to the worker. WIDENED.
--   c) apis/edge-api/notifications/src/fcm/sender.ts — ⚠ IGNORED `platform` ENTIRELY. It does not
--      fail on an unknown value; it silently sends a MOBILE-SHAPED message to a browser, which
--      duplicates the banner rather than erroring. That is 056's `requireDriver` shape — a check
--      that quietly admits a new value — and it is why the sender now BRANCHES on platform.
--   d) ⚠ packages/shared-types/src/device.ts — FOUND BY THE AUDIT, missed by the plan's research.
--      A dormant contract: exported from the package index and imported by NOTHING (verified by a
--      repo-wide search for `DeviceRegistrationRequest` and `DevicePlatform`). Its comment said
--      "Web push is out of scope this slice". Widened anyway — a shared contract that contradicts
--      the live one is two sources for one fact, which is the shape this repo has shipped five
--      defects through, and its dormancy is exactly what would let the contradiction sit unnoticed.
--      ⚠ Recorded, not fixed: it DUPLICATES (a) rather than being imported by it, because
--      `edge-shared` deliberately does not depend on `@effy/shared-types` (every other edge service
--      does). Collapsing them would restructure seven Lambda bundles, which is not this slice's
--      scope. The duplication is pre-existing; a test in each now pins them to the same set.
--
-- `notification_request.type` — the reader path is exhaustive BY TYPE and must stay that way:
--   • worker/copy.ts `COPY: Record<NotificationType, …>` — a missing type is a COMPILE error. This
--     is the property to preserve: no `default:` branch, no `as NotificationType`.
--   • worker/email-sender.ts `EMAIL_TEMPLATES: Partial<Record<…>>` — correctly partial; the four
--     new types are push-only and need no template.
--   • worker/drain.ts — passes `type` through opaquely. No switch.
--   • ⚠ worker/repository.ts `PendingRow.type` is an UNCHECKED assertion at the DB boundary. So a
--     row carrying a type an older deployed bundle does not know reaches `copyFor(type)` →
--     `COPY[type]` → undefined → a throw on `.title`, which kills THE WHOLE DRAIN — 053's
--     "an unconfigured FCM halted the whole drain" defect, by another route.
--     Two mitigations, both taken: `copyFor` now returns undefined for an unknown type and the
--     drain skips that row instead of dying, AND the deploy order below is mandatory.
--
-- ⚠ DEPLOY ORDER (and it is the reverse of the obvious one):
--     1. this migration            (`make db-up ENV=dev`)
--     2. edge-deploy SERVICE=notifications   ← the CONSUMER learns the new types FIRST
--     3. edge-deploy SERVICE=shop            ← then the PRODUCER starts writing them
--   A console registering platform='web' against an un-migrated database gets a CHECK violation on
--   every registration. The reverse order is merely inert.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. device_token.platform gains 'web' ────────────────────────────────────────────────────────
ALTER TABLE public.device_token DROP CONSTRAINT device_token_platform_check;
ALTER TABLE public.device_token ADD CONSTRAINT device_token_platform_check
    CHECK (platform IN ('android', 'ios', 'web'));

COMMENT ON COLUMN public.device_token.platform IS
    'Where this push address lives. 050: android|ios. 059 adds web — an FCM web registration token from a browser, opaque and UNIQUE exactly like a mobile one. ⚠ The notifications sender BRANCHES on this: web gets a data-only message because a `notification` block makes the Firebase SDK display the banner itself, on top of the one our service worker shows.';

-- ── 2. notification_request.type gains the four attention kinds ─────────────────────────────────
--
-- ⚠ FOUR TYPES, NOT ONE `shop_attention`. The operator chose to notify on all four conditions, and
-- the four behave nothing alike: two resolve within the hour, two can stay true for days, and one
-- is manager-only. 059 FR-024 requires them independently switchable and FR-022 requires one of
-- them filtered by role — a single type makes both unrepresentable.
ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed'
    ));

COMMENT ON COLUMN public.notification_request.type IS
    'What happened. 050 defined six; 059 adds the four shop attention kinds (awaiting_pick, out_of_stock, low_stock, refund_proposed), which are PUSH-ONLY — they get no email template, deliberately. ⚠ worker/copy.ts keys an exhaustive Record on this union, so adding a value here without adding its copy is a TypeScript compile error. Keep it that way: no default branch, no cast.';

-- ── 3. device_token.muted_types — per-registration preferences (FR-024/FR-025) ──────────────────
--
-- ⚠ PER REGISTRATION, NOT PER PERSON. FR-025 requires a manager's tablet and a picker's tablet to
-- be independently controllable; an operator-level preference makes that unrepresentable. A
-- registration IS "this device wants interrupting by this", which is not a property of the human.
--
-- ⚠ A COLUMN, NOT A SIDE TABLE. 054 settled this on the same ground: the worker reads it on EVERY
-- send, and a join added to learn one small set is a join added to the path that must stay cheap.
--
-- ⚠ OPT-OUT SHAPED (empty = everything on). A type added by a later slice is ON by default. An
-- operator who enabled notifications did so to be told things; a new alert that is silently off is
-- undiscoverable, whereas one that is unexpectedly on is a single tap to silence. The recoverable
-- failure is the right default.
--
-- ⚠ NOT constrained to a known type list. An unknown string mutes nothing, which is the safe
-- failure. A constraint would instead reject a preference an operator deliberately set, written by
-- a newer console against an older database.
ALTER TABLE public.device_token
    ADD COLUMN muted_types text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.device_token.muted_types IS
    '059 — notification types this ONE registration does not want (opt-out; empty = all on). Scoped per browser-per-device so one operator''s two devices differ (FR-025). Unconstrained on purpose: an unknown value mutes nothing, which beats refusing a write the operator meant.';

-- ── 4. public.shop_attention_state — when an attention condition began ──────────────────────────
--
-- The one genuinely new piece of state in 059, and it exists to answer a question nothing on this
-- platform can answer today: WHEN DID THIS START?
--
-- Attention is derived on READ, in edge-shop/src/today/service.ts, from four independent queries.
-- Correct for a screen, useless for a notification: "notify once per occurrence, and again if it
-- recurs" (FR-018/FR-019) is unanswerable without somewhere that remembers.
--
-- ⚠ WHY THIS IS A SCHEDULED EVALUATOR'S TABLE AND NOT A TRIGGER'S. `awaiting_pick` becomes true BY
-- THE PASSAGE OF TIME — an order ages into needing attention. There is no INSERT, no UPDATE, no
-- transaction to fire a trigger from. Any event-driven design covers three of the four conditions
-- and silently misses the most time-critical one. (058's trigger guard independently forbids the
-- shape: every trigger function in `public` is constrained to pg_notify + an ON CONFLICT DO NOTHING
-- insert, and these predicates are joins with thresholds and ordering.)
CREATE TABLE public.shop_attention_state (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id        uuid        NOT NULL REFERENCES public.shop(id) ON DELETE CASCADE,
    kind           text        NOT NULL CHECK (kind IN
                                   ('awaiting_pick', 'out_of_stock', 'low_stock', 'refund_proposed')),
    -- What the condition is ABOUT within its kind: a product id, an order id, or '' for a kind that
    -- is per-shop.
    --
    -- ⚠ `NOT NULL text`, THOUGH THREE OF THE FOUR VALUES ARE UUIDS. The fourth (`awaiting_pick`) is
    -- per-shop and has no subject, and a nullable uuid would put NULL in the UNIQUE below — where
    -- NULL is never equal to itself. The awaiting_pick row would then insert again on EVERY run and
    -- notify on every run: a green suite, and a console that interrupts an operator every few
    -- minutes forever. A NOT NULL text makes that unrepresentable.
    subject_key    text        NOT NULL,
    first_seen_at  timestamptz NOT NULL DEFAULT now(),
    last_seen_at   timestamptz NOT NULL DEFAULT now(),
    notified_at    timestamptz,
    CONSTRAINT shop_attention_state_uq UNIQUE (shop_id, kind, subject_key)
);

-- The evaluator's "what have I not told anyone about yet" read.
CREATE INDEX shop_attention_state_pending_idx
    ON public.shop_attention_state (shop_id) WHERE notified_at IS NULL;

COMMENT ON TABLE public.shop_attention_state IS
    '059 — one row per LIVE attention occurrence for a shop. Written only by the scheduled attention evaluator. ⚠ A row is DELETED when its condition clears, and that delete is what makes recurrence notify again (FR-019): a condition that comes back gets a NEW row with a NEW id, so its dedupe key is one the outbox has never seen. Keeping the row with a resolved_at and comparing timestamps would have made FR-019 a rule somebody has to remember instead of a consequence of the shape.';
COMMENT ON COLUMN public.shop_attention_state.id IS
    'The OCCURRENCE identity, and the thing notification_request.dedupe_key is built from. ⚠ Never key the dedupe on the product or order id: a product that goes out of stock, is restocked and goes out again is TWO occurrences and must notify twice — keying on the product would let the uniqueness that makes retries safe swallow the recurrence instead.';
COMMENT ON COLUMN public.shop_attention_state.subject_key IS
    'What the condition is about within its kind: product id (out_of_stock, low_stock), order id (refund_proposed), or '''' for the per-shop awaiting_pick. NOT NULL text, never a nullable uuid — see the column comment in the migration.';
COMMENT ON COLUMN public.shop_attention_state.notified_at IS
    'When the operators were told. NULL means the occurrence is recorded but unannounced — the evaluator crashed between the insert and the enqueue, or the run is mid-flight.';

-- +goose Down
-- Dev-only single-step down (003 policy; forward-only in anger).
DROP TABLE IF EXISTS public.shop_attention_state;

ALTER TABLE public.device_token DROP COLUMN IF EXISTS muted_types;

ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned'
    ));

ALTER TABLE public.device_token DROP CONSTRAINT device_token_platform_check;
ALTER TABLE public.device_token ADD CONSTRAINT device_token_platform_check
    CHECK (platform IN ('android', 'ios'));
