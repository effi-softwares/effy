-- +goose Up
-- 007-shop-web: the shop audience's own staff + RBAC system of record, scoped to a shop.
--
-- The platform's FIRST customer-operational (public) tables. Everything before this lived in the
-- `admin` schema (back-office accounts + audit). A shop is an operational entity every future
-- slice (inventory, picking, orders) joins against, so shop and its staff belong here.
--
-- The access decision is the conjunction of three terms, each owned by a different place:
--   role        reconciled from the cognito:groups claim (the identity provider is its ORIGIN)
--   status      platform-owned  — a disabled operator is denied despite a valid token
--   shop scope  platform-owned  — an unassigned operator, or one at an inactive shop, is denied
-- Only this record is authoritative for the decision (FR-021; constitution v1.6.0, Principle IV).

CREATE TABLE public.shop (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text NOT NULL UNIQUE,
    name       text NOT NULL,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.shop IS 'Hidden internal fulfillment node (007). Deliberately minimal: no address, hours, capacity, zones, or inventory — those arrive with the slice that needs them. Customers never see it.';
COMMENT ON COLUMN public.shop.code IS 'Operator-facing short code (e.g. CMB-01) — the provisioning handle.';
COMMENT ON COLUMN public.shop.is_active IS 'Deactivate rather than delete: staff reference this row (ON DELETE RESTRICT).';

CREATE TABLE public.shop_staff (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub  text NOT NULL UNIQUE,
    email        text,
    name         text,
    status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    shop_id      uuid REFERENCES public.shop(id) ON DELETE RESTRICT,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz
);
COMMENT ON TABLE public.shop_staff IS 'Shop operator — platform system of record keyed to the verified Cognito subject (007). Created on first authenticated contact (JIT upsert via GET /shop/v1/me).';
COMMENT ON COLUMN public.shop_staff.email IS 'NULLABLE by design: the shop pool uses email-as-username, so an access token may carry no email claim (research R6). Operator-authoritative at provisioning; refreshed from the token only when it supplies one, and never overwritten with NULL.';
COMMENT ON COLUMN public.shop_staff.shop_id IS 'NULLABLE by design: the JIT upsert meets an operator before their shop is known. NULL = unassigned, an expected state that grants nothing privileged. Platform-owned — never written from token data.';
COMMENT ON COLUMN public.shop_staff.status IS 'Platform-owned. A disabled operator is denied despite an otherwise-valid credential.';

-- FK lookup; also answers "who works at this shop" for later slices.
CREATE INDEX shop_staff_shop_id_idx ON public.shop_staff (shop_id);

CREATE TABLE public.shop_role (
    key         text PRIMARY KEY CHECK (key IN ('shop_manager', 'shop_staff')),
    description text NOT NULL
);
COMMENT ON TABLE public.shop_role IS 'Shop RBAC role lookup (seeded). Prefixed names keep `manager` unambiguously the back-office role in logs and JWT dumps.';

INSERT INTO public.shop_role (key, description) VALUES
    ('shop_manager', 'Manages a shop: full operator access plus shop-level administration.'),
    ('shop_staff',   'Baseline shop operator: day-to-day fulfillment work.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.shop_staff_role (
    staff_id   uuid NOT NULL REFERENCES public.shop_staff(id) ON DELETE CASCADE,
    role_key   text NOT NULL REFERENCES public.shop_role(key),
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (staff_id, role_key)
);
COMMENT ON TABLE public.shop_staff_role IS 'Shop role assignments (m:n). Reconciled from cognito:groups on each authenticated contact; unknown group names are filtered out before reconcile.';

CREATE INDEX shop_staff_role_role_key_idx ON public.shop_staff_role (role_key);

-- +goose Down
-- Dev-iteration convenience only (003 is forward-only in higher envs; db-down is refused
-- unless ENV=dev). FK-safe order.
DROP TABLE IF EXISTS public.shop_staff_role;
DROP TABLE IF EXISTS public.shop_role;
DROP TABLE IF EXISTS public.shop_staff;
DROP TABLE IF EXISTS public.shop;
