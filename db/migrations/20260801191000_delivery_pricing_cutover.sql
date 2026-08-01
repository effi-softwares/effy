-- +goose Up
-- 032-delivery-pricing — THE CUTOVER. Retires what the pricing rules and the approval workflow
-- replaced.
--
-- ⚠ WHY THIS IS A SECOND MIGRATION, AND NOT PART OF 20260801190000.
--
-- Everything below is genuinely part of feature 032, and putting it in the first migration would have
-- been the obvious tidy thing to do. It would also have withdrawn same-day from EVERY SHOPPER for the
-- whole of US1, US2 and US3: between deleting the old same_day rows and the new eligibility predicate
-- shipping, the old rule has nothing to read and the new one does not exist yet.
--
-- ⚠ EVERY TEST WOULD HAVE PASSED WHILE THAT WAS TRUE. The unit tests exercise the pure predicate,
-- not the configuration, so nothing would have gone red — the only symptom would have been shoppers
-- quietly losing an option nobody was watching for.
--
-- Apply this ONLY after the code implementing SamedayOffered (internal/platform/delivery/sameday.go)
-- is deployed. See specs/032-delivery-pricing/tasks.md T094 and research.md R3a.

-- ── 1. Same-day is no longer a rate-grid row (FR-029) ─────────────────────────────────────────
--
-- ⚠ A same_day row only ever meant "these two postcodes share a delivery zone". Zone REGIONAL holds
-- both Ballarat and Bendigo, so it let a shop 98 km away — as far as Melbourne — serve Ballarat
-- "because it was nearby". Eligibility is now a statement a shop made and an admin approved, in
-- public.shop_sameday_declaration.
--
-- ⚠ Leaving these rows would give the platform TWO sources for one answer, and the older one is the
-- exact rule this feature exists to replace.
DELETE FROM public.delivery_offering WHERE method = 'same_day';

-- ── 2. The grid no longer decides what anything COSTS (research R3a) ──────────────────────────
--
-- ⚠ DROPPED, NOT DEPRECATED. All three methods are priced by public.delivery_pricing_rule now.
-- Leaving price_amount in place would leave standard delivery with two live fee sources and nothing
-- choosing between them — the same defect class as the same_day rows above, one axis over. A dropped
-- column cannot be read by a query somebody writes next year; a deprecated one can.
--
-- ⚠ This loses no history: order_package_delivery.delivery_fee_amount records what every order was
-- actually quoted (FR-010), so the grid held configuration, never records.
ALTER TABLE public.delivery_offering DROP COLUMN price_amount;

-- The cutoff moved onto the shop's declaration, where it belongs: it describes a shop's working day
-- ("we stop packing at 2pm"), not a property of a zone pair.
ALTER TABLE public.delivery_offering DROP COLUMN same_day_cutoff;

COMMENT ON TABLE public.delivery_offering IS 'Which delivery methods are offered on a (origin zone -> destination zone) leg, and their promised window (021, narrowed by 032). ⚠ It no longer decides PRICE — public.delivery_pricing_rule is the single source of a delivery fee — and it no longer decides SAME-DAY, which is per shop via public.shop_sameday_declaration. What remains is the lead time and whether standard/scheduled are offered on a leg at all.';

-- +goose Down
-- ⚠ IRREVERSIBLE IN SUBSTANCE. The columns can be re-added, but their VALUES cannot: every
-- per-leg price and cutoff an operator had configured is gone, and the deleted same_day rows with
-- them. Rolling back leaves an empty grid that offers no same-day and prices nothing — which is worse
-- than the state before this migration, not a return to it.
--
-- Restoring the pre-032 behaviour means re-entering that configuration by hand.
ALTER TABLE public.delivery_offering ADD COLUMN price_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price_amount >= 0);
ALTER TABLE public.delivery_offering ADD COLUMN same_day_cutoff time;
