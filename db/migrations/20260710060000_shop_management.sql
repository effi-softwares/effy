-- +goose Up
-- 009-shop-management: evolve the 007 shop tables for back-office management, and add the
-- general back-office audit log.
--
-- 1. public.shop gains a 3-value lifecycle `status` (replacing the 007 boolean `is_active`) plus
--    optional administrative contact fields. The 007 manager gate is reconciled in lockstep to
--    key on `status = 'active'` (research R2). public.shop ships empty (007 shipped no creation
--    path), so the backfill is a no-op in practice.
-- 2. admin.audit_log records every privileged back-office action (who/what/target/when) — the
--    viewable history FR-016 requires. General by design (ARCHITECTURE: admin schema = accounts
--    + audit); this slice writes shop-management actions to it.

ALTER TABLE public.shop
    ADD COLUMN status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'disabled'));

-- Backfill from the retired boolean before dropping it (no-op while the table is empty).
UPDATE public.shop SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END;

ALTER TABLE public.shop DROP COLUMN is_active;

ALTER TABLE public.shop ADD COLUMN contact_phone text;
ALTER TABLE public.shop ADD COLUMN notes text;

COMMENT ON COLUMN public.shop.status IS 'Lifecycle (009): active serves operators; suspended (temporary hold) and disabled (deactivated, retained for audit) both refuse via the manager gate. Replaces the 007 is_active boolean.';
COMMENT ON COLUMN public.shop.contact_phone IS 'Optional administrative contact (009). Not an operational attribute.';
COMMENT ON COLUMN public.shop.notes IS 'Optional free-text administrative note (009).';

CREATE TABLE admin.audit_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_sub   text NOT NULL,
    action      text NOT NULL,
    target_type text NOT NULL,
    target_id   uuid,
    detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE admin.audit_log IS 'Back-office action audit (009). actor_sub = the back-office cognito_sub; target = a shop or shop_staff. detail carries before/after with NO PII beyond governance (no raw token; email omitted by default).';

-- History view: entries for one target, newest first.
CREATE INDEX audit_log_target_idx ON admin.audit_log (target_type, target_id, created_at DESC);
-- Actor audit: everything one operator did, newest first.
CREATE INDEX audit_log_actor_idx ON admin.audit_log (actor_sub, created_at DESC);

-- +goose Down
-- Dev-iteration convenience only (003 forward-only in higher envs; db-down refused unless ENV=dev).
DROP TABLE IF EXISTS admin.audit_log;

ALTER TABLE public.shop DROP COLUMN IF EXISTS notes;
ALTER TABLE public.shop DROP COLUMN IF EXISTS contact_phone;

ALTER TABLE public.shop ADD COLUMN is_active boolean NOT NULL DEFAULT true;
UPDATE public.shop SET is_active = (status = 'active');
ALTER TABLE public.shop DROP COLUMN status;
