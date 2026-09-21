-- +goose Up
-- Teardown of the 049 driver WORK model, ahead of the intelligent dispatch slice.
--
-- ⚠ WHY THIS IS A DEMOLITION AND NOT A REFACTOR. 049's assignment was a greedy sweep: one
-- `rate(1 minute)` worker picked the single longest-on-duty driver with no active run of that type
-- and handed them EVERY ready package on the platform. No capacity, no proximity, no batching, no
-- second driver until the first finished. `public.driver.delivery_zone_id` carries the comment "a
-- driver with no zone is inert for assignment (FR-010)" and NEITHER assignment query ever referenced
-- zone — FR-010 was never built. Routing was `ORDER BY shop_id`, which is UUID order, not distance.
-- There is no dispatcher, no offer/accept, no re-assignment, and no manual override.
--
-- The tables below encode that operation's shape, not merely its data: a run is typed
-- `collection | same_day_delivery`, `driver_run.checked_in` is a hub-check-in pivot, and
-- `delivery_task_package` exists because standard packages leave the driver's world at the hub. An
-- intelligent dispatcher should not have to inherit those assumptions and then argue with them. A
-- schema nothing reads is a design decision made in advance for a feature nobody has specified yet
-- (the reasoning 057 used when it removed purchasing rather than leaving it dormant).
--
-- ⚠ WHAT THIS DELIBERATELY KEEPS. `public.driver` and `public.driver_duty_session` are the driver
-- IDENTITY and availability model — back-office provisioning (056), the access decision (Principle
-- IV), on/off duty, and the location snapshot. They are not part of the work model and the new slice
-- needs all of them. 053's `public.carrier_handoff` and `public.package_arrival` also stay; only
-- `package_arrival.delivery_task_id`, a pointer INTO the work model, goes with it.
--
-- ⚠ CONSEQUENCE, STATED PLAINLY: after this migration nothing advances `shop_fulfillment` from
-- `ready_for_pickup` to `collected`, and nothing but back-office arrival recording (053) reaches
-- `delivered`. That is the intended blank slate — the driver-driven half of the fulfilment loop is
-- unbuilt until the dispatch slice rebuilds it, and pretending otherwise by leaving dead tables
-- standing is what makes a gap invisible.
--
-- ⚠ DESTRUCTIVE BY DESIGN. Every run, task, proof, failure and activity row is discarded. In dev
-- these are test rows; 049's own sign-off records that the live loop was walked once by the operator.
--
-- Order matters: dependents first, so no FK is left pointing at a dropped table.

-- 053's arrival attribution pointed into the work model; the arrival record itself stays.
DROP INDEX IF EXISTS public.package_arrival_delivery_task_idx;
ALTER TABLE public.package_arrival DROP COLUMN IF EXISTS delivery_task_id;

-- Leaves of the work model.
DROP TABLE IF EXISTS public.driver_activity;
DROP TABLE IF EXISTS public.driver_task_event;
DROP TABLE IF EXISTS public.delivery_failure;
DROP TABLE IF EXISTS public.proof_of_delivery;
DROP TABLE IF EXISTS public.delivery_task_package;
DROP TABLE IF EXISTS public.collection_task_issue;

-- Then the tasks, then the run that groups them.
DROP TABLE IF EXISTS public.delivery_task;
DROP TABLE IF EXISTS public.collection_task;
DROP TABLE IF EXISTS public.driver_run;

-- +goose Down
-- Dev-only single-step down (003). Restores the SHAPE as it stood after 056 — the dropped rows are
-- gone for good. Mirrors 20260822120000_driver_delivery.sql,
-- 20260822130000_delivery_task_address_nullable.sql, 20260826232728_order_lifecycle_completion.sql
-- and 20260830055348_driver_management.sql; see those files for the reasoning on each column.

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
CREATE INDEX driver_run_driver_idx ON public.driver_run (driver_id);

CREATE TABLE public.collection_task (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              uuid NOT NULL REFERENCES public.driver_run (id) ON DELETE CASCADE,
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE RESTRICT,
    shop_id             uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    sequence            int  NOT NULL CHECK (sequence >= 0),
    status              text NOT NULL DEFAULT 'assigned'
                          CHECK (status IN ('assigned', 'en_route', 'collected', 'short')),
    collected_at        timestamptz,
    CONSTRAINT collection_task_package_uq UNIQUE (shop_fulfillment_id)
);
CREATE INDEX collection_task_run_idx ON public.collection_task (run_id);
CREATE INDEX collection_task_shop_idx ON public.collection_task (shop_id);

CREATE TABLE public.collection_task_issue (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_task_id uuid NOT NULL REFERENCES public.collection_task (id) ON DELETE CASCADE,
    order_item_id      uuid REFERENCES public.order_item (id) ON DELETE SET NULL,
    kind               text NOT NULL CHECK (kind IN ('missing', 'short')),
    note               text,
    reported_at        timestamptz NOT NULL DEFAULT now(),
    resolved_at        timestamptz,
    resolved_by_sub    text,
    resolution_note    text
);
CREATE INDEX collection_task_issue_task_idx ON public.collection_task_issue (collection_task_id);
CREATE INDEX collection_task_issue_item_idx ON public.collection_task_issue (order_item_id);
CREATE INDEX collection_task_issue_open_idx
    ON public.collection_task_issue (reported_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE public.delivery_task (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              uuid NOT NULL REFERENCES public.driver_run (id) ON DELETE CASCADE,
    order_id            uuid NOT NULL REFERENCES public."order" (id) ON DELETE RESTRICT,
    customer_address_id uuid REFERENCES public.customer_address (id) ON DELETE RESTRICT,
    sequence            int  NOT NULL CHECK (sequence >= 0),
    status              text NOT NULL DEFAULT 'staged'
                          CHECK (status IN ('staged', 'out_for_delivery', 'en_route', 'arrived', 'delivered', 'failed')),
    delivered_at        timestamptz,
    CONSTRAINT delivery_task_order_uq UNIQUE (order_id)
);
CREATE INDEX delivery_task_run_idx ON public.delivery_task (run_id);
CREATE INDEX delivery_task_address_idx ON public.delivery_task (customer_address_id);

CREATE TABLE public.delivery_task_package (
    delivery_task_id    uuid NOT NULL REFERENCES public.delivery_task (id) ON DELETE CASCADE,
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE RESTRICT,
    PRIMARY KEY (delivery_task_id, shop_fulfillment_id),
    CONSTRAINT delivery_task_package_uq UNIQUE (shop_fulfillment_id)
);

CREATE TABLE public.proof_of_delivery (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_task_id uuid NOT NULL UNIQUE REFERENCES public.delivery_task (id) ON DELETE CASCADE,
    method           text NOT NULL CHECK (method IN ('photo', 'code', 'signature', 'contactless')),
    media_key        text,
    code_verified    boolean,
    note             text,
    captured_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_failure (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_task_id uuid NOT NULL REFERENCES public.delivery_task (id) ON DELETE CASCADE,
    reason           text NOT NULL
                       CHECK (reason IN ('nobody_home', 'wrong_address', 'customer_refused', 'access_blocked', 'other')),
    note             text,
    failed_at        timestamptz NOT NULL DEFAULT now(),
    resolved_at      timestamptz,
    resolved_by_sub  text,
    resolution_note  text
);
CREATE INDEX delivery_failure_task_idx ON public.delivery_failure (delivery_task_id);
CREATE INDEX delivery_failure_open_idx
    ON public.delivery_failure (failed_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE public.driver_task_event (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id             uuid REFERENCES public.driver_run (id) ON DELETE CASCADE,
    collection_task_id uuid REFERENCES public.collection_task (id) ON DELETE CASCADE,
    delivery_task_id   uuid REFERENCES public.delivery_task (id) ON DELETE CASCADE,
    status             text NOT NULL,
    at                 timestamptz NOT NULL DEFAULT now(),
    change_id          uuid,
    CONSTRAINT driver_task_event_one_subject CHECK (
        (run_id IS NOT NULL)::int + (collection_task_id IS NOT NULL)::int + (delivery_task_id IS NOT NULL)::int = 1
    )
);
CREATE INDEX driver_task_event_run_idx ON public.driver_task_event (run_id);
CREATE INDEX driver_task_event_collection_idx ON public.driver_task_event (collection_task_id);
CREATE INDEX driver_task_event_delivery_idx ON public.driver_task_event (delivery_task_id);
CREATE UNIQUE INDEX driver_task_event_change_uq ON public.driver_task_event (change_id) WHERE change_id IS NOT NULL;

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
CREATE INDEX driver_activity_driver_idx ON public.driver_activity (driver_id);
CREATE INDEX driver_activity_run_idx ON public.driver_activity (run_id);
CREATE INDEX driver_activity_delivery_idx ON public.driver_activity (delivery_task_id);

ALTER TABLE public.package_arrival
    ADD COLUMN delivery_task_id uuid REFERENCES public.delivery_task (id) ON DELETE SET NULL;
CREATE INDEX package_arrival_delivery_task_idx ON public.package_arrival (delivery_task_id);
