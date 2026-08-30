-- +goose Up
-- 056-driver-management: back-office driver management.
--
-- ⚠ THIS FEATURE IS OVERWHELMINGLY A READER. Of the eleven driver tables 049 created, this migration
-- ALTERS THREE and CREATES NONE. 049 built the driver app and, alongside it, a deliberately minimal
-- provisioning adjunct; its own spec recorded the debt in plain words: "a full driver-management
-- console is out of scope for this slice unless folded in during planning." This is that slice, and
-- almost everything it needs is already in the database — it was simply never read.
--
-- Three things change:
--
--   1. `public.driver.status` widens from two values to THREE. "Back next week" and "no longer
--      employed" are different facts and the register is unusable for either while they are the same
--      value. `public.shop` has modelled exactly this three-state lifecycle since 009.
--
--   2. `public.driver` gains the ten columns a driver's profile of record actually needs. Before
--      this it carried name, work email, zone, vehicle type and plate — a contact card, not an
--      employment record.
--
--   3. `public.delivery_failure` and `public.collection_task_issue` gain resolution state.
--      ⚠ BOTH TABLES ARE ANNOTATED "recorded for back-office follow-up" AND NEITHER HAS EVER HAD A
--      READER. `apis/edge-api/driver` is the only code that touches them and it only inserts. The
--      order-flow register names failed-delivery visibility the top remaining structural gap: a
--      shopper whose delivery failed keeps seeing "on the way", indefinitely, and nobody at Effy is
--      told. These three columns are what let a person close the loop.
--
-- House style (007/009/019/047/049/053/055): everything operational in `public`; raw SQL; text CHECK
-- enums (no native PG enums, no triggers); an index on every FK; COMMENT ON everything. Governance
-- reuses admin.audit_log. See specs/056-driver-management/data-model.md.

-- ── 1. Employment status: two values become three ────────────────────────────────────────────────
--
-- ⚠ THE ORDER MATTERS. Map the data FIRST, then swap the constraint. Adding the new CHECK while a
-- 'disabled' row still exists would fail the ALTER and abort the whole migration.
--
-- ⚠ WHY THIS IS SAFE FOR EVERY EXISTING READER, verified rather than assumed: all six sites that
-- read this column test the POSITIVE state (`d.status = 'active'`) —
--   apis/edge-api/driver/src/assignment/repository.ts:17,38,153,170
--   apis/edge-api/driver/src/delivery/assignment.ts:17
-- Not one tests `<> 'disabled'`, so not one silently admits a new state. That is the 055 lesson
-- applied on purpose: 053's account-closure blocker was written as `<> 'delivered'` and two new
-- terminal states walked straight through it, holding a customer for seven days over a package
-- nobody was carrying. A negative test against a widening enum is a latent defect. A test pins this
-- (fleet/src/drivers/status-guard.test.ts) rather than a comment, because "all six happen to be
-- positive today" is not a property that survives the next edit.
ALTER TABLE public.driver DROP CONSTRAINT IF EXISTS driver_status_check;

UPDATE public.driver SET status = 'offboarded' WHERE status = 'disabled';

ALTER TABLE public.driver
    ADD CONSTRAINT driver_status_check CHECK (status IN ('active', 'suspended', 'offboarded'));

ALTER TABLE public.driver ADD COLUMN status_reason     text;
ALTER TABLE public.driver ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.driver.status IS
  'Employment lifecycle (056, widening 049''s active|disabled). active = employed and eligible for work; suspended = temporarily stood down, retained, no access, no work, restorable; offboarded = no longer employed, retained for audit, permanently no access. Platform-owned — NEVER written from a token claim. 049''s ''disabled'' mapped to ''offboarded''; a suspension has never been representable, so no existing row could have meant it.';
COMMENT ON COLUMN public.driver.status_reason IS
  'Why the current status was set (056, FR-016). Required by the service on every transition; nullable here because rows predating 056 have no recorded reason and inventing one would be a lie in an audit-adjacent column.';
COMMENT ON COLUMN public.driver.status_changed_at IS
  'When the current status took effect (056, FR-006). Defaults to now() on the widening, which for a pre-056 row means "as at the migration" rather than the true date — the audit trail carries the truth from here on.';

-- ── 2. The profile of record ─────────────────────────────────────────────────────────────────────
--
-- ⚠ FOUR OF THESE ARE PII (contact_phone, emergency_contact_name, emergency_contact_phone,
-- licence_reference). FR-050: they must not appear in any log line, metric label, analytics event,
-- or admin.audit_log detail payload. The audit writer redacts them by name
-- (fleet/src/shared/audit.ts REDACTED_FIELDS) and a test proves it.
ALTER TABLE public.driver ADD COLUMN contact_phone           text;
ALTER TABLE public.driver ADD COLUMN started_on              date;
ALTER TABLE public.driver ADD COLUMN emergency_contact_name  text;
ALTER TABLE public.driver ADD COLUMN emergency_contact_phone text;
ALTER TABLE public.driver ADD COLUMN notes                   text;
ALTER TABLE public.driver ADD COLUMN licence_reference       text;
ALTER TABLE public.driver ADD COLUMN licence_expires_on      date;
ALTER TABLE public.driver ADD COLUMN vehicle_registration_expires_on date;

COMMENT ON COLUMN public.driver.contact_phone IS
  '056, FR-007. ⚠ PII — never in a log, metric label, analytics payload or audit detail (FR-050).';
COMMENT ON COLUMN public.driver.started_on IS
  'Employment start date (056, FR-007). Nullable — unknown for drivers provisioned before 056, and a guessed start date on an employment record is worse than an empty one.';
COMMENT ON COLUMN public.driver.emergency_contact_name IS
  '056, FR-007. ⚠ PII, and it is a THIRD PARTY''s — someone who never dealt with Effy at all. Same handling rule (FR-050).';
COMMENT ON COLUMN public.driver.emergency_contact_phone IS
  '056, FR-007. ⚠ PII, third-party (FR-050).';
COMMENT ON COLUMN public.driver.notes IS
  'Free-text administrative note (056, FR-007). Mirrors public.shop.notes (009).';
COMMENT ON COLUMN public.driver.licence_reference IS
  'Driving licence reference (056, FR-008). ⚠ PII (FR-050). ⚠ A REFERENCE AND A DATE, NEVER A DOCUMENT IMAGE — storing scans would create a store of sensitive identity documents with its own retention, access-control and deletion obligations, which this slice deliberately does not open (research R17).';
COMMENT ON COLUMN public.driver.licence_expires_on IS
  'Licence expiry (056, FR-008/FR-046). An expiry in the past makes the driver ineligible for work and is flagged wherever they are listed; one inside the configurable warning window is flagged with its date.';
COMMENT ON COLUMN public.driver.vehicle_registration_expires_on IS
  'Vehicle registration expiry (056, FR-008/FR-046). Flagged like the licence; does NOT by itself block assignment, because a driver may change vehicle.';

-- Search and paging (FR-003, FR-004, FR-005).
-- pg_trgm is already installed (016 product search); citext by 011 and 049. No new extension.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX driver_name_trgm_idx ON public.driver USING gin (name gin_trgm_ops);
CREATE INDEX driver_status_idx    ON public.driver (status);
-- Keyset paging ordering (FR-004). ⚠ The cursor is minted from THIS SAME EXPRESSION — 053 ordered on
-- created_at and minted its cursor from placed_at, always the later instant, so paging RE-SHOWED
-- ROWS; and its first test passed with the defect in place because it called the repository directly
-- and supplied its own cursor, never touching the service where the cursor is minted.
CREATE INDEX driver_register_idx  ON public.driver (name, id);

-- ⚠ NOTE: public.driver.work_email is ALREADY citext NOT NULL UNIQUE (049). That existing unique
-- index is what makes FR-014's duplicate refusal a DATABASE guarantee rather than a service check.
-- Nothing is added for it here; it is named because the refusal depends on it.

-- ── 3. Exception resolution — the readers these tables never had ─────────────────────────────────
ALTER TABLE public.delivery_failure ADD COLUMN resolved_at     timestamptz;
ALTER TABLE public.delivery_failure ADD COLUMN resolved_by_sub text;
ALTER TABLE public.delivery_failure ADD COLUMN resolution_note text;

COMMENT ON COLUMN public.delivery_failure.resolved_at IS
  '056, FR-031. NULL = outstanding. Resolution is ONE-WAY and a resolved exception is NEVER deleted — a deleted exception is an un-auditable one, and an exception whose order is later cancelled or refunded stays readable with the connection recorded in the note.';
COMMENT ON COLUMN public.delivery_failure.resolved_by_sub IS
  '056. The back-office cognito_sub who resolved it. A snapshot, not an FK — admin.staff is a different schema and staff attribution follows the 046 pattern.';
COMMENT ON COLUMN public.delivery_failure.resolution_note IS
  '056, FR-031. What was done about it. Required by the service.';

-- "What is outstanding" is the query on the landing screen (FR-032), so it gets the partial index.
CREATE INDEX delivery_failure_open_idx
    ON public.delivery_failure (failed_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.collection_task_issue ADD COLUMN resolved_at     timestamptz;
ALTER TABLE public.collection_task_issue ADD COLUMN resolved_by_sub text;
ALTER TABLE public.collection_task_issue ADD COLUMN resolution_note text;

COMMENT ON COLUMN public.collection_task_issue.resolved_at IS
  '056, FR-031. NULL = outstanding. Same one-way, never-deleted rule as delivery_failure.';
COMMENT ON COLUMN public.collection_task_issue.resolved_by_sub IS
  '056. The back-office cognito_sub who resolved it (snapshot, not an FK).';
COMMENT ON COLUMN public.collection_task_issue.resolution_note IS
  '056, FR-031. What was done about it.';

CREATE INDEX collection_task_issue_open_idx
    ON public.collection_task_issue (reported_at DESC) WHERE resolved_at IS NULL;

-- ⚠ NOTHING ELSE ON EITHER EXCEPTION TABLE CHANGES, and the driver app is not touched. It keeps
-- writing exceptions exactly as it does today; this feature only adds the reader that was always
-- implied by the word "follow-up".

-- +goose Down
-- Forward-only platform (constitution). Dev-only single-step down for local iteration.
DROP INDEX IF EXISTS public.collection_task_issue_open_idx;
ALTER TABLE public.collection_task_issue DROP COLUMN IF EXISTS resolution_note;
ALTER TABLE public.collection_task_issue DROP COLUMN IF EXISTS resolved_by_sub;
ALTER TABLE public.collection_task_issue DROP COLUMN IF EXISTS resolved_at;

DROP INDEX IF EXISTS public.delivery_failure_open_idx;
ALTER TABLE public.delivery_failure DROP COLUMN IF EXISTS resolution_note;
ALTER TABLE public.delivery_failure DROP COLUMN IF EXISTS resolved_by_sub;
ALTER TABLE public.delivery_failure DROP COLUMN IF EXISTS resolved_at;

DROP INDEX IF EXISTS public.driver_register_idx;
DROP INDEX IF EXISTS public.driver_status_idx;
DROP INDEX IF EXISTS public.driver_name_trgm_idx;

ALTER TABLE public.driver DROP COLUMN IF EXISTS vehicle_registration_expires_on;
ALTER TABLE public.driver DROP COLUMN IF EXISTS licence_expires_on;
ALTER TABLE public.driver DROP COLUMN IF EXISTS licence_reference;
ALTER TABLE public.driver DROP COLUMN IF EXISTS notes;
ALTER TABLE public.driver DROP COLUMN IF EXISTS emergency_contact_phone;
ALTER TABLE public.driver DROP COLUMN IF EXISTS emergency_contact_name;
ALTER TABLE public.driver DROP COLUMN IF EXISTS started_on;
ALTER TABLE public.driver DROP COLUMN IF EXISTS contact_phone;
ALTER TABLE public.driver DROP COLUMN IF EXISTS status_changed_at;
ALTER TABLE public.driver DROP COLUMN IF EXISTS status_reason;

ALTER TABLE public.driver DROP CONSTRAINT IF EXISTS driver_status_check;
UPDATE public.driver SET status = 'disabled' WHERE status IN ('suspended', 'offboarded');
ALTER TABLE public.driver
    ADD CONSTRAINT driver_status_check CHECK (status IN ('active', 'disabled'));
