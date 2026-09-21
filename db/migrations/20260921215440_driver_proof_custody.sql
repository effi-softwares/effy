-- +goose Up
-- 064-driver-proof-custody — slice D of the logistics rebuild: evidence and custody.
--
-- Spec: specs/064-driver-proof-custody/spec.md. Data model: ../data-model.md. Research: ../research.md.
--
-- ⚠ PURELY ADDITIVE. No DROP, no ALTER ... DROP COLUMN, no data rewrite. Nothing existing reads these
-- tables until the new routes ship, so this is safe to apply before its code.
--
-- ⚠ WHAT THIS CLOSES. Until now a same-day order could not reach `delivered` AT ALL by the hand of
-- the driver who delivered it: the only writer of that status anywhere on the platform is
-- `edge-api/orders/src/arrival/repository.ts`, 053's BACK-OFFICE manual arrival path built for
-- standard carrier packages. `edge-api/driver/src/work/delivery.ts` says so in its own comment —
-- "`delivered` is NOT reachable here: completing a drop requires proof (D16), which is Slice D".
-- This is that slice.

-- ── Proof of delivery ───────────────────────────────────────────────────────────────────────────
--
-- One row per completed drop. The row IS the proof; the image sits beside it in S3 under `proof/`.
CREATE TABLE public.delivery_proof (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id               uuid        NOT NULL REFERENCES public.round_stop (id),
    method                text        NOT NULL,
    media_key             text        NULL,
    note                  text        NULL,
    captured_by_driver_id uuid        NOT NULL REFERENCES public.driver (id),
    captured_at           timestamptz NOT NULL,
    change_id             uuid        NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),

    -- ⚠ `code` IS DELIBERATELY ABSENT (spec FR-003, research R4). No delivery code exists anywhere on
    -- this platform — `delivery_code` appears in no service, migration, contract or app. Verifying one
    -- means ISSUING one and showing it to the customer, which FR-027 scoped out of this slice.
    -- Admitting the value here would leave a representable state nothing can verify; 063 recorded that
    -- a closed CHECK is what turns a rule into a fact. Widening it later is one line — after the
    -- reader audit that 053, 056, 057 and 059 each shipped a defect through.
    CONSTRAINT delivery_proof_method_check
        CHECK (method IN ('photo', 'signature', 'contactless')),

    -- ⚠ THIS IS WHAT MAKES FR-005 A PROPERTY OF THE DATABASE. A drop cannot accumulate two proofs, so
    -- a retried submission cannot record a second delivery however the service behaves. SC-007 (two
    -- devices, one completion) rests on this line, not on application logic.
    CONSTRAINT delivery_proof_stop_uq UNIQUE (stop_id),
    CONSTRAINT delivery_proof_change_uq UNIQUE (change_id),

    -- ⚠ FR-006 IN THE SCHEMA RATHER THAN IN A SERVICE'S MEMORY. A photo or signature proof with no
    -- image is unrepresentable, so a drop can never be marked delivered against evidence that failed
    -- to upload. Contactless is the one method legitimately allowed no media.
    CONSTRAINT delivery_proof_photo_media_check
        CHECK (method <> 'photo' OR media_key IS NOT NULL),
    CONSTRAINT delivery_proof_signature_media_check
        CHECK (method <> 'signature' OR media_key IS NOT NULL)
);

CREATE INDEX delivery_proof_captured_idx ON public.delivery_proof (captured_at DESC);

COMMENT ON TABLE public.delivery_proof IS
    'Evidence a same-day drop was completed (064). One row per drop. Media lives in S3 under proof/ '
    'and is ARCHIVED, never deleted (operator direction) — so there is no expiry column and no '
    'media_deleted flag: an absent object means a fault, not an expired record.';

-- ── Delivery attempt failures ───────────────────────────────────────────────────────────────────
--
-- ⚠ THIS REPLACES `public.delivery_failure`, WHICH 063's TEARDOWN DROPPED — confirmed absent from the
-- live dev database. It is a NEW table rather than a restoration because the work model the old one
-- referenced (`delivery_task`) no longer exists; this one hangs off `round_stop`.
--
-- ⚠ 056 EXISTED BECAUSE THE DRIVER APP WAS "recording exceptions for a reader that does not exist".
-- It built that reader; the teardown then removed the tables from under it. The capability regressed
-- to WORSE than 056 found it — neither a writer nor a reader — which is why US3 is in this slice.
CREATE TABLE public.delivery_attempt_failure (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id     uuid        NOT NULL REFERENCES public.round_stop (id),
    reason      text        NOT NULL,
    note        text        NULL,
    driver_id   uuid        NOT NULL REFERENCES public.driver (id),
    failed_at   timestamptz NOT NULL,
    resolved_at timestamptz NULL,
    change_id   uuid        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    -- A closed set. Free text would be unreportable in aggregate, which is the entire point of an
    -- exception list.
    CONSTRAINT delivery_attempt_failure_reason_check
        CHECK (reason IN ('nobody_home', 'wrong_address', 'customer_refused', 'access_blocked', 'other')),

    -- ⚠ FR-010 IN THE SCHEMA. A free-text escape hatch with no text is an exception nobody can act on.
    CONSTRAINT delivery_attempt_failure_other_note_check
        CHECK (reason <> 'other' OR (note IS NOT NULL AND btrim(note) <> '')),

    CONSTRAINT delivery_attempt_failure_change_uq UNIQUE (change_id)
);

-- ⚠ DELIBERATELY NO `UNIQUE (stop_id)`. A drop may be attempted more than once over its life, and a
-- second attempt is a second row. Collapsing them would destroy the history FR-012 exists to keep.
CREATE INDEX delivery_attempt_failure_stop_idx ON public.delivery_attempt_failure (stop_id);

-- The back-office exception list reads open failures; partial so it stays small as history grows.
CREATE INDEX delivery_attempt_failure_open_idx
    ON public.delivery_attempt_failure (failed_at DESC)
    WHERE resolved_at IS NULL;

COMMENT ON TABLE public.delivery_attempt_failure IS
    'A drop that could not be completed (064). Many rows per stop — each attempt is its own record. '
    'Read by back-office via edge-api/fleet; replaces delivery_failure, dropped by 063.';

-- +goose Down
-- Forward-only platform (Principle: Technology Standards). Present so goose can parse the file;
-- dev-only single-step rollback.
DROP TABLE IF EXISTS public.delivery_attempt_failure;
DROP TABLE IF EXISTS public.delivery_proof;
