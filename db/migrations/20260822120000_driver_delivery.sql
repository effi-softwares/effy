-- +goose Up
-- 049-driver-mobile-app: the driver side of the hub-and-spoke operation — the driver record, duty
-- sessions, typed runs (collection / same-day delivery), collection & delivery tasks, hub check-in,
-- proof of delivery, failures, a status timeline, and an in-app activity feed.
--
-- ⚠ This slice makes the 020 dev-only driver stubs REAL. Since 019/020 the shop-fulfilment lifecycle
-- has run pending → received → picking → ready_for_pickup → collected → delivered, but `collected`
-- and `delivered` were written ONLY by the dev-only pickup/deliver stubs
-- (apis/edge-api/shop/scripts/invoke-*-stub.mjs). The driver app is now the real writer of those two
-- transitions: a collection_task advances a portion ready_for_pickup → collected, and a
-- delivery_task advances collected → delivered with proof. The status CHECK is unchanged (020 already
-- widened it); this migration adds the driver-side tables that drive those transitions.
--
-- Hub-and-spoke model (settled 2026-08-22; CLAUDE.md "Driver logistics model"): a driver runs a
-- COLLECTION RUN (a round of shops → one central hub), CHECKS IN at the hub (the same-day/standard
-- split is already known from checkout — 047 order_package_delivery.method — nothing is sorted), then
-- runs a SAME-DAY DELIVERY RUN (hub → customers) closed with proof. Standard packages leave the
-- driver's world at hub check-in (external carrier). One central hub = 047's delivery_settings.
--
-- Reuse over rebuild (research R3): the "package" the driver handles IS a public.shop_fulfillment row
-- (UNIQUE(order_id, shop_id)); its METHOD is public.order_package_delivery.method for the same key;
-- the HUB is public.delivery_settings; the COLLECTION SCHEDULE is public.delivery_collection_run.
--
-- House style (007/009/019/020/027/047): everything operational in `public`; raw SQL; text CHECK
-- enums (no native PG enums, no triggers); an index on every FK; numeric only for money (none here —
-- the driver never sees currency, FR-013); COMMENT ON everything. Audit reuses admin.audit_log.
-- See specs/049-driver-mobile-app/data-model.md.

-- ── The driver record — authoritative for the access decision (Principle IV) ─────────────────────
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.driver (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub      text   NOT NULL UNIQUE,
    name             text   NOT NULL,
    work_email       citext NOT NULL UNIQUE,
    delivery_zone_id uuid   REFERENCES public.delivery_zone (id) ON DELETE SET NULL,
    vehicle_type     text,
    vehicle_plate    text,
    status           text   NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  public.driver IS 'An Effy courier employee (049). Back-office-provisioned (no self-signup); the platform record is authoritative for the access decision (status/zone) — a valid driver-pool token never overrides a disabled driver (Principle IV). Keyed on cognito_sub. The hub is the singleton delivery_settings in v1 (no per-driver hub column yet; multi-hub deferred).';
COMMENT ON COLUMN public.driver.status IS 'platform-owned; disabled = cannot obtain a working session and is excluded from assignment. Never written from a token claim.';
COMMENT ON COLUMN public.driver.delivery_zone_id IS 'The zone assignment is scoped to (FR-010). Nullable until back-office sets it — a driver with no zone is inert for assignment (research I2 resolution).';
CREATE INDEX driver_zone_idx ON public.driver (delivery_zone_id);

-- ── Duty sessions — "on duty" gates assignment (FR-005/006) ──────────────────────────────────────
CREATE TABLE public.driver_duty_session (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id         uuid NOT NULL REFERENCES public.driver (id) ON DELETE CASCADE,
    started_at        timestamptz NOT NULL DEFAULT now(),
    ended_at          timestamptz,
    -- Optional point-in-time location snapshot for nearest-driver preference (R2). NEVER streamed.
    last_location_lat numeric(9, 6),
    last_location_lng numeric(9, 6),
    last_location_at  timestamptz
);
COMMENT ON TABLE public.driver_duty_session IS 'A period a driver is on duty (049). On duty = an open session (ended_at IS NULL). Optional location snapshot is read only at assignment time (research R2) — the app never continuously streams GPS.';
CREATE INDEX driver_duty_session_driver_idx ON public.driver_duty_session (driver_id);
-- At most one open session per driver.
CREATE UNIQUE INDEX driver_duty_session_open_uq ON public.driver_duty_session (driver_id) WHERE ended_at IS NULL;

-- ── Typed runs — collection or same-day delivery (FR-007) ─────────────────────────────────────────
CREATE TABLE public.driver_run (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id     uuid NOT NULL REFERENCES public.driver (id) ON DELETE RESTRICT,
    type          text NOT NULL CHECK (type IN ('collection', 'same_day_delivery')),
    status        text NOT NULL DEFAULT 'assigned'
                    CHECK (status IN ('assigned', 'active', 'checked_in', 'completed', 'cancelled')),
    business_date date NOT NULL,
    assigned_at   timestamptz NOT NULL DEFAULT now(),
    completed_at  timestamptz
);
COMMENT ON TABLE public.driver_run IS 'A collection run or a same-day delivery run (049). Groups typed tasks; powers the phase-aware home (FR-021) and the two history record types (FR-033). Work is typed tasks, not driver roles — one driver typically does a collection run then a same-day round in a shift. `checked_in` is a collection-run-only state (the hub-check-in pivot).';
COMMENT ON COLUMN public.driver_run.business_date IS 'Australia/Melbourne working day (047 timezone rule).';
CREATE INDEX driver_run_driver_idx ON public.driver_run (driver_id);

-- ── Collection task — one package to collect from a shop ─────────────────────────────────────────
CREATE TABLE public.collection_task (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              uuid NOT NULL REFERENCES public.driver_run (id) ON DELETE CASCADE,
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE RESTRICT,
    shop_id             uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    sequence            int  NOT NULL CHECK (sequence >= 0),
    status              text NOT NULL DEFAULT 'assigned'
                          CHECK (status IN ('assigned', 'en_route', 'collected', 'short')),
    collected_at        timestamptz,
    -- One package (shop_fulfillment portion) is collected by EXACTLY ONE task — makes a double-assign
    -- impossible even if two sweeps race (research R10).
    CONSTRAINT collection_task_package_uq UNIQUE (shop_fulfillment_id)
);
COMMENT ON TABLE public.collection_task IS 'A single package to collect from a shop (049). The package IS a shop_fulfillment portion; its same-day/standard method is order_package_delivery.method for the same (order_id, shop_id). Collecting it advances the portion ready_for_pickup → collected. `short` = collected with a reported missing/short item (see collection_task_issue), still terminal for check-in.';
CREATE INDEX collection_task_run_idx ON public.collection_task (run_id);
CREATE INDEX collection_task_shop_idx ON public.collection_task (shop_id);

-- ── Reported missing/short at a shop (FR-015) — never blocks collecting the rest ──────────────────
CREATE TABLE public.collection_task_issue (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_task_id uuid NOT NULL REFERENCES public.collection_task (id) ON DELETE CASCADE,
    order_item_id      uuid REFERENCES public.order_item (id) ON DELETE SET NULL,
    kind               text NOT NULL CHECK (kind IN ('missing', 'short')),
    note               text,
    reported_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.collection_task_issue IS 'A missing or short package/item reported at a shop (049, FR-015). Recorded for back-office; does not block collecting the remaining packages.';
CREATE INDEX collection_task_issue_task_idx ON public.collection_task_issue (collection_task_id);
CREATE INDEX collection_task_issue_item_idx ON public.collection_task_issue (order_item_id);

-- ── Delivery task (a drop) — one customer drop = an order's same-day packages ─────────────────────
CREATE TABLE public.delivery_task (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              uuid NOT NULL REFERENCES public.driver_run (id) ON DELETE CASCADE,
    order_id            uuid NOT NULL REFERENCES public."order" (id) ON DELETE RESTRICT,
    customer_address_id uuid NOT NULL REFERENCES public.customer_address (id) ON DELETE RESTRICT,
    sequence            int  NOT NULL CHECK (sequence >= 0),
    status              text NOT NULL DEFAULT 'staged'
                          CHECK (status IN ('staged', 'out_for_delivery', 'en_route', 'arrived', 'delivered', 'failed')),
    delivered_at        timestamptz,
    -- One open drop per order at a time (a customer's same-day packages arrive as ONE drop — SC-006).
    CONSTRAINT delivery_task_order_uq UNIQUE (order_id)
);
COMMENT ON TABLE public.delivery_task IS 'A customer drop (049): an order''s same-day packages delivered as one stop (SC-006), even when collected from several shops. Delivering it advances every constituent shop_fulfillment portion collected → delivered, in one transaction, only once a proof_of_delivery exists (FR-026).';
CREATE INDEX delivery_task_run_idx ON public.delivery_task (run_id);
CREATE INDEX delivery_task_address_idx ON public.delivery_task (customer_address_id);

-- ── The packages that make up a drop ─────────────────────────────────────────────────────────────
CREATE TABLE public.delivery_task_package (
    delivery_task_id    uuid NOT NULL REFERENCES public.delivery_task (id) ON DELETE CASCADE,
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE RESTRICT,
    PRIMARY KEY (delivery_task_id, shop_fulfillment_id),
    -- A same-day package belongs to EXACTLY ONE drop (no double-assign — research R10).
    CONSTRAINT delivery_task_package_uq UNIQUE (shop_fulfillment_id)
);
COMMENT ON TABLE public.delivery_task_package IS 'Join: the same-day shop_fulfillment portions composing a drop (049). Only same-day packages appear here; standard packages left the driver at hub check-in.';

-- ── Proof of delivery — a drop cannot be delivered without one (FR-026) ───────────────────────────
CREATE TABLE public.proof_of_delivery (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_task_id uuid NOT NULL UNIQUE REFERENCES public.delivery_task (id) ON DELETE CASCADE,
    method           text NOT NULL CHECK (method IN ('photo', 'code', 'signature', 'contactless')),
    media_key        text,       -- private S3 key for photo/signature (never public); null for code/contactless
    code_verified    boolean,    -- non-null only when method = 'code'
    note             text,
    captured_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.proof_of_delivery IS 'Completion evidence for a drop (049, FR-024–027). 1:1 with a delivered delivery_task. Media (photo/signature) lives in the private media bucket; only the key is stored. A drop reaches `delivered` ONLY in the same transaction that writes this row.';

-- ── Undeliverable record (FR-028) ────────────────────────────────────────────────────────────────
CREATE TABLE public.delivery_failure (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_task_id uuid NOT NULL REFERENCES public.delivery_task (id) ON DELETE CASCADE,
    reason           text NOT NULL
                       CHECK (reason IN ('nobody_home', 'wrong_address', 'customer_refused', 'access_blocked', 'other')),
    note             text,
    failed_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.delivery_failure IS 'The reason + note when a drop is marked undeliverable (049, FR-028). Recorded for back-office follow-up.';
CREATE INDEX delivery_failure_task_idx ON public.delivery_failure (delivery_task_id);

-- ── Append-only status timeline (powers history detail, FR-034) ──────────────────────────────────
CREATE TABLE public.driver_task_event (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id             uuid REFERENCES public.driver_run (id) ON DELETE CASCADE,
    collection_task_id uuid REFERENCES public.collection_task (id) ON DELETE CASCADE,
    delivery_task_id   uuid REFERENCES public.delivery_task (id) ON DELETE CASCADE,
    status             text NOT NULL,
    at                 timestamptz NOT NULL DEFAULT now(),
    change_id          uuid,   -- per-action idempotency key (research R10); a repeat is a no-op
    -- Exactly one subject per event.
    CONSTRAINT driver_task_event_one_subject CHECK (
        (run_id IS NOT NULL)::int + (collection_task_id IS NOT NULL)::int + (delivery_task_id IS NOT NULL)::int = 1
    )
);
COMMENT ON TABLE public.driver_task_event IS 'Append-only status timeline for runs/tasks (049). Written in the same transaction as each transition, so it can never disagree with current state. change_id makes a retried offline action idempotent (research R10).';
CREATE INDEX driver_task_event_run_idx ON public.driver_task_event (run_id);
CREATE INDEX driver_task_event_collection_idx ON public.driver_task_event (collection_task_id);
CREATE INDEX driver_task_event_delivery_idx ON public.driver_task_event (delivery_task_id);
-- A given action applies at most once per subject (idempotency).
CREATE UNIQUE INDEX driver_task_event_change_uq ON public.driver_task_event (change_id) WHERE change_id IS NOT NULL;

-- ── In-app activity feed (FR-032); the source for push when the notifications path lands ──────────
CREATE TABLE public.driver_activity (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id        uuid NOT NULL REFERENCES public.driver (id) ON DELETE CASCADE,
    type             text NOT NULL
                       CHECK (type IN ('run_assigned', 'packages_ready', 'sameday_window', 'reminder', 'issue_ack', 'cutoff_missed')),
    run_id           uuid REFERENCES public.driver_run (id) ON DELETE SET NULL,
    delivery_task_id uuid REFERENCES public.delivery_task (id) ON DELETE SET NULL,
    body             text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    read_at          timestamptz
);
COMMENT ON TABLE public.driver_activity IS 'Driver-facing events (049, FR-032): the in-app activity feed, and the record from which push is sent when the notifications path is built (FR-031, deferred). `cutoff_missed` flags a same-day package uncollected past its collection run cutoff (spec edge case).';
CREATE INDEX driver_activity_driver_idx ON public.driver_activity (driver_id);
CREATE INDEX driver_activity_run_idx ON public.driver_activity (run_id);
CREATE INDEX driver_activity_delivery_idx ON public.driver_activity (delivery_task_id);

-- +goose Down
-- Forward-only platform (constitution). Dev-only single-step down for local iteration.
DROP TABLE IF EXISTS public.driver_activity;
DROP TABLE IF EXISTS public.driver_task_event;
DROP TABLE IF EXISTS public.delivery_failure;
DROP TABLE IF EXISTS public.proof_of_delivery;
DROP TABLE IF EXISTS public.delivery_task_package;
DROP TABLE IF EXISTS public.delivery_task;
DROP TABLE IF EXISTS public.collection_task_issue;
DROP TABLE IF EXISTS public.collection_task;
DROP TABLE IF EXISTS public.driver_run;
DROP TABLE IF EXISTS public.driver_duty_session;
DROP TABLE IF EXISTS public.driver;
