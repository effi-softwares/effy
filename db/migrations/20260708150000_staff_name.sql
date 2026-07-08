-- +goose Up
-- 006-first-admin-bootstrap: back-office staff gain a display name — set by the bootstrap CLI
-- (and, later, by back-office admin management). Nullable: existing JIT-created rows (005) have
-- no name; the bootstrap and future flows populate it.
ALTER TABLE admin.staff ADD COLUMN name text;
COMMENT ON COLUMN admin.staff.name IS 'Display name (006 — set by the create-first-admin CLI / back-office admin management).';

-- +goose Down
-- Dev-iteration convenience only (003 is forward-only in higher envs).
ALTER TABLE admin.staff DROP COLUMN name;
