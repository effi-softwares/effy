-- +goose Up
-- 089 — every package (one shop's portion of one order) gets a permanent 6-character code, printed on
-- its label and later scanned (driver backlog H1).
--
-- ⚠ A DATABASE DEFAULT, SO NO WRITER CAN FORGET IT. `finalizeSucceeded` is today's one writer of
-- shop_fulfillment; a second one tomorrow gets a code without knowing this exists.
-- ⚠ The alphabet has no look-alikes (no 0/O, 1/I/L, U): a code is read aloud and typed off a wet bag.
-- It is the same string as PACKAGE_CODE_ALPHABET in packages/shared-types/src/package-code.ts, pinned
-- by a test. 30^6 ≈ 729 million codes; the code is an identifier, not a secret, so random() suffices.

-- +goose StatementBegin
CREATE FUNCTION public.new_package_code() RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
    candidate text;
BEGIN
    LOOP
        candidate := '';
        FOR i IN 1..6 LOOP
            candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        END LOOP;
        IF NOT EXISTS (SELECT 1 FROM public.shop_fulfillment WHERE package_code = candidate) THEN
            RETURN candidate;
        END IF;
    END LOOP;
END
$$;
-- +goose StatementEnd

ALTER TABLE public.shop_fulfillment ADD COLUMN package_code text;

-- Every package that already exists gets its code now, so no read path ever has to write one.
-- ⚠ ONE ROW PER STATEMENT: in a single multi-row UPDATE the function's uniqueness check cannot see
-- the codes given to earlier rows of the same statement.
-- +goose StatementBegin
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id FROM public.shop_fulfillment WHERE package_code IS NULL LOOP
        UPDATE public.shop_fulfillment SET package_code = public.new_package_code() WHERE id = r.id;
    END LOOP;
END
$$;
-- +goose StatementEnd

ALTER TABLE public.shop_fulfillment
    ALTER COLUMN package_code SET NOT NULL,
    ALTER COLUMN package_code SET DEFAULT public.new_package_code(),
    ADD CONSTRAINT shop_fulfillment_package_code_uq UNIQUE (package_code),
    ADD CONSTRAINT shop_fulfillment_package_code_check CHECK (package_code ~ '^[2-9A-HJKMNP-TV-Z]{6}$');

COMMENT ON COLUMN public.shop_fulfillment.package_code IS
    '089 — the package''s permanent code, printed on its label as EFY1:<code>. Never changed, never reused.';

-- +goose Down
ALTER TABLE public.shop_fulfillment
    DROP CONSTRAINT shop_fulfillment_package_code_check,
    DROP CONSTRAINT shop_fulfillment_package_code_uq,
    DROP COLUMN package_code;
DROP FUNCTION public.new_package_code();
