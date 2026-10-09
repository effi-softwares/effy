-- +goose Up
-- 083 (stage 1) — the cutover to the new delivery model gets its controls.
--
-- ⚠ ADDITIVE, AND IT TURNS NOTHING ON. The switch itself has existed since 078
-- (delivery_settings.delivery_model_v2_from, NULL = off) and still has its one reader
-- (public.delivery_model_v2_at). This adds one setting. The switch is SET only by an admin, through
-- the go-live route, which refuses while the platform is not ready — never by a migration.

ALTER TABLE public.delivery_settings
    ADD COLUMN legacy_orders_alert_days int NOT NULL DEFAULT 7
        CONSTRAINT delivery_settings_legacy_alert_days_ck CHECK (legacy_orders_alert_days BETWEEN 1 AND 60);
COMMENT ON COLUMN public.delivery_settings.legacy_orders_alert_days IS 'After the new delivery model is switched on, how many days orders sold the OLD way (no delivery type) may stay open before the operator is alerted (083). They are finished exactly as sold; the removal of the old arrangement waits for them.';

COMMENT ON COLUMN public.delivery_settings.delivery_model_v2_from IS 'THE SWITCH (078). NULL = the new delivery model is off; an instant = it applies from then. Read ONLY through public.delivery_model_v2_at. ⚠ ONE WRITER since 083: the back-office go-live route (admin service, go-live.repository.ts), admin role only, refused while the go-live checklist has a required item not ready; a scheduled moment whose readiness breaks is cleared by the switch sweep. Every change is in admin.audit_log (target_type delivery_model).';

-- +goose Down
ALTER TABLE public.delivery_settings DROP COLUMN legacy_orders_alert_days;
