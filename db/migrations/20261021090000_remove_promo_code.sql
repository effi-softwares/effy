-- +goose Up
-- 094 STAGE C — remove the 027/028/029 promotion model, which 094 copied into `promotion` and stopped
-- writing. Run ONLY after a release in which nothing reads `promo_code` or `promo_redemption`
-- (`promotions.guard.test.ts` and a repo-wide search for both names must find no reader but this file).
--
-- ⚠ `"order".promo_code` (the code's TEXT on old orders) is KEPT: receipts and the order screens still
-- name an old order's code from it. Only the foreign keys and the old tables go.

-- Stage A copied each cart's code into `promotion_code_id` but left the old column set; clear it there.
UPDATE public.cart SET promo_code_id = NULL WHERE promo_code_id IS NOT NULL AND promotion_code_id IS NOT NULL;

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.cart WHERE promo_code_id IS NOT NULL) THEN
        RAISE EXCEPTION 'a cart points at a promo_code that was never copied to promotion_code_id; nothing is removed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.promo_code pc
                WHERE NOT EXISTS (SELECT 1 FROM public.promotion p WHERE p.legacy_promo_code_id = pc.id)) THEN
        RAISE EXCEPTION 'a promo_code was never copied into promotion; nothing is removed';
    END IF;
END
$$;
-- +goose StatementEnd

-- An old order names its code from `promo_code` (text) alone from now on; fill any that relied on the join.
UPDATE public."order" o SET promo_code = pc.code
  FROM public.promo_code pc
 WHERE pc.id = o.promo_code_id AND o.promo_code IS NULL;

-- A promotion's history is read by its own id from now on; move 027's entries onto the promotion they became.
UPDATE admin.audit_log a SET target_type = 'promotion', target_id = p.id
  FROM public.promotion p
 WHERE a.target_type = 'promo_code' AND a.target_id = p.legacy_promo_code_id;

ALTER TABLE public.cart DROP COLUMN promo_code_id;
ALTER TABLE public."order" DROP COLUMN promo_code_id;
ALTER TABLE public.promotion DROP COLUMN legacy_promo_code_id;
DROP TABLE public.promo_redemption;
DROP TABLE public.promo_code;

-- +goose Down
-- Not reversible: the old tables' rows were copied into `promotion` / `promotion_use` by stage A, and
-- 094's code reads only those. Restore from a backup if the old model must come back.
SELECT 1;
