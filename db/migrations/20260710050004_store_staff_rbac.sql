-- +goose Up
-- 007-shop-web: the store audience's own staff + RBAC system of record, scoped to a store.
--
-- The platform's FIRST customer-operational (public) tables. Everything before this lived in the
-- `admin` schema (back-office accounts + audit). A store is an operational entity every future
-- slice (inventory, picking, orders) joins against, so store and its staff belong here.
--
-- The access decision is the conjunction of three terms, each owned by a different place:
--   role         reconciled from the cognito:groups claim (the identity provider is its ORIGIN)
--   status       platform-owned  — a disabled operator is denied despite a valid token
--   store scope  platform-owned  — an unassigned operator, or one at an inactive store, is denied
-- Only this record is authoritative for the decision (FR-021; constitution v1.5.0, Principle IV).

CREATE TABLE public.store (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text NOT NULL UNIQUE,
    name       text NOT NULL,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.store IS 'Hidden internal fulfillment node (007). Deliberately minimal: no address, hours, capacity, zones, or inventory — those arrive with the slice that needs them. Customers never see it.';
COMMENT ON COLUMN public.store.code IS 'Operator-facing short code (e.g. CMB-01) — the provisioning handle.';
COMMENT ON COLUMN public.store.is_active IS 'Deactivate rather than delete: staff reference this row (ON DELETE RESTRICT).';

CREATE TABLE public.store_staff (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub  text NOT NULL UNIQUE,
    email        text,
    name         text,
    status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    store_id     uuid REFERENCES public.store(id) ON DELETE RESTRICT,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz
);
COMMENT ON TABLE public.store_staff IS 'Store operator — platform system of record keyed to the verified Cognito subject (007). Created on first authenticated contact (JIT upsert via GET /store/v1/me).';
COMMENT ON COLUMN public.store_staff.email IS 'NULLABLE by design: the shop pool uses email-as-username, so an access token may carry no email claim (research R6). Operator-authoritative at provisioning; refreshed from the token only when it supplies one, and never overwritten with NULL.';
COMMENT ON COLUMN public.store_staff.store_id IS 'NULLABLE by design: the JIT upsert meets an operator before their store is known. NULL = unassigned, an expected state that grants nothing privileged. Platform-owned — never written from token data.';
COMMENT ON COLUMN public.store_staff.status IS 'Platform-owned. A disabled operator is denied despite an otherwise-valid credential.';

-- FK lookup; also answers "who works at this store" for later slices.
CREATE INDEX store_staff_store_id_idx ON public.store_staff (store_id);

CREATE TABLE public.store_role (
    key         text PRIMARY KEY CHECK (key IN ('store_manager', 'store_staff')),
    description text NOT NULL
);
COMMENT ON TABLE public.store_role IS 'Store RBAC role lookup (seeded). Prefixed names keep `manager` unambiguously the back-office role in logs and JWT dumps.';

INSERT INTO public.store_role (key, description) VALUES
    ('store_manager', 'Manages a store: full operator access plus store-level administration.'),
    ('store_staff',   'Baseline store operator: day-to-day fulfillment work.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.store_staff_role (
    staff_id   uuid NOT NULL REFERENCES public.store_staff(id) ON DELETE CASCADE,
    role_key   text NOT NULL REFERENCES public.store_role(key),
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (staff_id, role_key)
);
COMMENT ON TABLE public.store_staff_role IS 'Store role assignments (m:n). Reconciled from cognito:groups on each authenticated contact; unknown group names are filtered out before reconcile.';

CREATE INDEX store_staff_role_role_key_idx ON public.store_staff_role (role_key);

-- +goose Down
-- Dev-iteration convenience only (003 is forward-only in higher envs; db-down is refused
-- unless ENV=dev). FK-safe order.
DROP TABLE IF EXISTS public.store_staff_role;
DROP TABLE IF EXISTS public.store_role;
DROP TABLE IF EXISTS public.store_staff;
DROP TABLE IF EXISTS public.store;
