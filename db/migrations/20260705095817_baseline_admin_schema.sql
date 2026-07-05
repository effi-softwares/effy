-- +goose Up
-- 003-db-migrations baseline: prove the migration loop and establish the platform's
-- two-schema model (CLAUDE.md): public = operational, admin = back-office accounts + audit.
-- Deliberately NO tables — those arrive with their owning feature slices.
CREATE SCHEMA IF NOT EXISTS admin;

COMMENT ON SCHEMA admin IS 'Effy back-office: admin accounts + audit (baseline shell, slice 003-db-migrations; tables arrive with their feature slices)';

-- +goose Down
-- Safe while the schema is empty (it stays empty in this slice); dev-iteration use only.
DROP SCHEMA IF EXISTS admin;
