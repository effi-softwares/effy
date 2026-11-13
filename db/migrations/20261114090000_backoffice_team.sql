-- 119 Back-office team management (specs/119-backoffice-team-management): the staff record becomes the origin and the
-- authority for a back-office role (research R1) - /me no longer creates records or rewrites roles from the token.
--
-- • admin.staff_role: ONE role per person (UNIQUE (staff_id)). A person holding several keeps the highest
--   (admin > manager > csa); each collapse is audited `team.role_changed` by `system:119`.
-- • admin.staff: `removed` status (the record is kept so a name stays on old actions), `revision` (stale views refused),
--   who added / disabled / removed and when, the last invitation, the sign-in disagreement (`sign_in_issue`).
--   `email` becomes citext, lower-cased, UNIQUE.
-- • Active people with NO role (made by the old token reconcile, never given a role by anyone) are DISABLED with
--   `sign_in_issue = 'no_role'` and audited `team.disabled {reason:'no_role'}` - spec FR-035.
-- • A row whose email has no "@" (the old insert stored the token's username, a UUID) is marked `email_differs`; the
--   first check or a Repair copies the sign-in account's email onto it.
-- • admin.staff_former_subject: subjects a re-added person signed in with before (staffNameSql reads it).
-- • admin.sign_in_orphan: sign-in accounts with no record ("Not on the team"), rewritten by the check.
-- • admin.team_check: one row, when the check last ran (skipped within 60 seconds).
-- Every later write is `@effy/edge-shared/team` writer.ts (team.guard.test.ts).

-- +goose Up

-- ── 1. One role per person: keep the highest, audit each collapse ────────────────────────────────────────────────
WITH ranked AS (
    SELECT staff_id, role_key,
           row_number() OVER (PARTITION BY staff_id
                              ORDER BY CASE role_key WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END) AS rn,
           count(*) OVER (PARTITION BY staff_id) AS held
      FROM admin.staff_role
), collapsed AS (
    SELECT staff_id,
           jsonb_agg(role_key ORDER BY rn) AS held_roles,
           max(role_key) FILTER (WHERE rn = 1) AS kept
      FROM ranked
     WHERE held > 1
     GROUP BY staff_id
), audited AS (
    INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
    SELECT 'system:119', 'team.role_changed', 'staff', staff_id,
           jsonb_build_object('from', held_roles, 'to', kept, 'reason', 'one_role')
      FROM collapsed
    RETURNING target_id
)
DELETE FROM admin.staff_role sr
 USING ranked r
 WHERE r.staff_id = sr.staff_id AND r.role_key = sr.role_key AND r.rn > 1;

ALTER TABLE admin.staff_role ADD CONSTRAINT staff_role_one_per_staff UNIQUE (staff_id);

-- ── 2. The record's new facts ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE admin.staff DROP CONSTRAINT staff_status_check;
ALTER TABLE admin.staff ADD CONSTRAINT staff_status_check
    CHECK (status = ANY (ARRAY['active', 'disabled', 'removed']));

ALTER TABLE admin.staff
    ADD COLUMN revision integer DEFAULT 1 NOT NULL,
    ADD COLUMN added_by_sub text,
    ADD COLUMN disabled_at timestamp with time zone,
    ADD COLUMN disabled_by_sub text,
    ADD COLUMN removed_at timestamp with time zone,
    ADD COLUMN removed_by_sub text,
    ADD COLUMN invited_at timestamp with time zone,
    ADD COLUMN invitation_message_id text,
    ADD COLUMN sign_in_issue text,
    ADD COLUMN sign_in_checked_at timestamp with time zone;

ALTER TABLE admin.staff ADD CONSTRAINT staff_sign_in_issue_check
    CHECK (sign_in_issue IS NULL OR sign_in_issue = ANY (ARRAY[
        'missing', 'enabled_while_off', 'disabled_while_on', 'group_differs', 'no_role', 'email_differs']));
ALTER TABLE admin.staff ADD CONSTRAINT staff_removed_has_when_check
    CHECK (status <> 'removed' OR removed_at IS NOT NULL);

-- ── 3. People with no role are disabled (spec FR-035), with the reason recorded ──────────────────────────────────
WITH disabled AS (
    UPDATE admin.staff s
       SET status = 'disabled', disabled_at = now(), disabled_by_sub = 'system:119',
           sign_in_issue = 'no_role', sign_in_checked_at = now(),
           revision = revision + 1, updated_at = now()
     WHERE s.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM admin.staff_role sr WHERE sr.staff_id = s.id)
    RETURNING s.id
)
INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
SELECT 'system:119', 'team.disabled', 'staff', id, jsonb_build_object('reason', 'no_role')
  FROM disabled;

-- ── 4. The email: citext, lower-cased; a non-email value is marked for repair ────────────────────────────────────
ALTER TABLE admin.staff ALTER COLUMN email TYPE public.citext USING lower(btrim(email));

UPDATE admin.staff
   SET sign_in_issue = 'email_differs', sign_in_checked_at = now()
 WHERE position('@' IN email) = 0 AND sign_in_issue IS NULL;

-- ── 5. Two records with one email: stop, never guess which is the person ─────────────────────────────────────────
-- +goose StatementBegin
DO $$
DECLARE
    dup text;
BEGIN
    SELECT email INTO dup FROM admin.staff GROUP BY email HAVING count(*) > 1 LIMIT 1;
    IF dup IS NOT NULL THEN
        RAISE EXCEPTION 'backoffice_team_duplicate_email: two admin.staff records share the email %; merge them by hand before migrating', dup;
    END IF;
END;
$$;
-- +goose StatementEnd

ALTER TABLE admin.staff ADD CONSTRAINT staff_email_key UNIQUE (email);

CREATE INDEX staff_status_name_idx ON admin.staff (status, lower(COALESCE(name, email::text)), id);
CREATE INDEX staff_attention_idx ON admin.staff (id) WHERE sign_in_issue IS NOT NULL;

-- ── 6. New tables ─────────────────────────────────────────────────────────────────────────────────────────────────
-- A subject this person signed in with before they were removed and added again (research R4).
CREATE TABLE admin.staff_former_subject (
    cognito_sub text PRIMARY KEY,
    staff_id uuid NOT NULL REFERENCES admin.staff (id),
    until timestamp with time zone NOT NULL
);
CREATE INDEX staff_former_subject_staff_idx ON admin.staff_former_subject (staff_id);

-- A sign-in account in the back-office pool with no team record: "Not on the team". The check rewrites it whole.
CREATE TABLE admin.sign_in_orphan (
    cognito_username text PRIMARY KEY,
    cognito_sub text NOT NULL,
    email public.citext,
    enabled boolean NOT NULL,
    groups text[] NOT NULL,
    created_in_pool_at timestamp with time zone,
    found_at timestamp with time zone NOT NULL
);

-- When the sign-in check last ran (one row).
CREATE TABLE admin.team_check (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    checked_at timestamp with time zone NOT NULL
);

REVOKE ALL ON TABLE admin.staff_former_subject FROM effy_shopper;
REVOKE ALL ON TABLE admin.sign_in_orphan FROM effy_shopper;
REVOKE ALL ON TABLE admin.team_check FROM effy_shopper;

-- +goose Down
-- The collapsed roles and the people disabled for no role are NOT restored: the audit log says what they were.
DROP TABLE admin.team_check;
DROP TABLE admin.sign_in_orphan;
DROP TABLE admin.staff_former_subject;

DROP INDEX admin.staff_attention_idx;
DROP INDEX admin.staff_status_name_idx;
ALTER TABLE admin.staff DROP CONSTRAINT staff_email_key;
ALTER TABLE admin.staff ALTER COLUMN email TYPE text;

UPDATE admin.staff SET status = 'disabled' WHERE status = 'removed';
ALTER TABLE admin.staff DROP CONSTRAINT staff_removed_has_when_check;
ALTER TABLE admin.staff DROP CONSTRAINT staff_sign_in_issue_check;
ALTER TABLE admin.staff
    DROP COLUMN sign_in_checked_at,
    DROP COLUMN sign_in_issue,
    DROP COLUMN invitation_message_id,
    DROP COLUMN invited_at,
    DROP COLUMN removed_by_sub,
    DROP COLUMN removed_at,
    DROP COLUMN disabled_by_sub,
    DROP COLUMN disabled_at,
    DROP COLUMN added_by_sub,
    DROP COLUMN revision;
ALTER TABLE admin.staff DROP CONSTRAINT staff_status_check;
ALTER TABLE admin.staff ADD CONSTRAINT staff_status_check
    CHECK (status = ANY (ARRAY['active', 'disabled']));

ALTER TABLE admin.staff_role DROP CONSTRAINT staff_role_one_per_staff;
