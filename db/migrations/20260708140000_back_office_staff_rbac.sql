-- +goose Up
-- 005-back-office-web: the platform's OWN back-office staff + RBAC system of record
-- (constitution: admin schema = back-office accounts + audit). The first real tables beyond
-- the 003 baseline shell. Normalized RBAC (research F1): Cognito seeds roles, the platform owns
-- status. Keyed to the verified Cognito subject (FR-019–022).

CREATE TABLE admin.staff (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub  text NOT NULL UNIQUE,
    email        text NOT NULL,
    status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz
);
COMMENT ON TABLE admin.staff IS 'Back-office staff — platform system of record keyed to the verified Cognito subject (005). status is platform-owned; a disabled row is denied despite a valid token.';

CREATE TABLE admin.role (
    key         text PRIMARY KEY CHECK (key IN ('admin', 'manager', 'csa')),
    description text NOT NULL
);
COMMENT ON TABLE admin.role IS 'Back-office RBAC role lookup (seeded).';

INSERT INTO admin.role (key, description) VALUES
    ('admin',   'Administrator — full back-office access'),
    ('manager', 'Manager — elevated operational access'),
    ('csa',     'Customer-service agent — support access')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE admin.staff_role (
    staff_id   uuid NOT NULL REFERENCES admin.staff(id) ON DELETE CASCADE,
    role_key   text NOT NULL REFERENCES admin.role(key),
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (staff_id, role_key)
);
COMMENT ON TABLE admin.staff_role IS 'Back-office role assignments (m:n). Roles reconciled from cognito:groups on each authenticated contact (005).';

-- +goose Down
-- Dev-iteration convenience only (003 is forward-only in higher envs).
DROP TABLE IF EXISTS admin.staff_role;
DROP TABLE IF EXISTS admin.role;
DROP TABLE IF EXISTS admin.staff;
