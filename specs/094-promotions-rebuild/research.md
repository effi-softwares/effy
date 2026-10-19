# Research: Promotions Rebuilt (094)

Each decision: what was chosen, why, and what else was considered. "Today" means the 027/028/029 model as
read from the code on 2026-10-19.

## What exists today

- **Data**: `promo_code` (one code, percent or fixed, minimum, dates, caps, `status`, plus the 028/029
  banner columns `is_advertised`, `banner_title`, `banner_subtitle`, `banner_image_key`,
  `banner_position`, `banner_placement`). `promo_redemption` (one row per PAID order, `order_id` UNIQUE,
  the source of both caps). `cart.promo_code_id`. `order.discount_amount`, `order.promo_code_id`,
  `order.promo_code` (text snapshot).
- **Evaluation**: `commerce/src/promo/promo.ts` (`evaluatePromo`, `discountFor`), called by the cart read
  and by checkout's intent (`discountForCustomer`), which recomputes the discount. The delivery fee is
  judged on goods after the discount (`basketValueCents`).
- **Recording**: `shared/src/payments/finalize.ts` step 10 inserts `promo_redemption` in the paid-order
  transaction. ⚠ Caps are counted from PAID orders only, so two shoppers paying at the same moment can
  both take the last use. Nothing is held at the intent.
- **Display**: storefront `home` returns `banners` (advertised codes) and `GET /storefront/v1/promotions/{id}`.
  customer-web draws the hero, side cards and between-sections offers from `home.banners` by `placement`.
  The customer app does the same (`HomeBlock.Promo` / `HomeBlock.Offers`).
- **Refunds**: `priceLines` prices a refunded line at `unit_price × quantity`, ignoring the discount; the
  ceiling is `payment.amount`, so a discounted order cannot be over-refunded in total, but a part refund
  of discounted lines returns more than the shopper paid for them.
- **Shops**: the shop order money panel carries `discount` and `promoCode`.
- **Receipts**: the email reads `order.discount_amount` and `order.promo_code`.

## R1 — New tables beside the old, then the old removed in a later migration

**Decision**: Add `promotion`, `promotion_code`, `promotion_target`, `promotion_customer`,
`promotion_use`, `promotion_group`, `promotion_group_member`, `order_promotion`, and per-line
`order_item.discount_amount`. The migration copies every `promo_code` into a `promotion` (kind `cart`,
trigger `code`, one shared code) and every `promo_redemption` into a confirmed `promotion_use`, and
places advertised codes into the starting groups. `promo_code` and `promo_redemption` stay, read-only and
written by nothing, until a removal migration in a later stage (as 083 did for the old delivery model).

**Rationale**: Widening `promo_code` would keep a table whose every column name says "a code", when most
new promotions have none. Copying keeps old orders' foreign keys (`order.promo_code_id`) intact.

**Alternatives**: rename and widen `promo_code` (rejected: the 1-to-1 code assumption is in the name, in
the unique index and in `cart.promo_code_id`); drop the old tables in the same migration (rejected: a
failed deploy between migration and code would leave no evaluator able to read live codes).

## R2 — One promotion engine, in the shared library

**Decision**: `@effy/edge-shared/promotions` holds the only evaluator: a pure function
`pricePromotions(basket, candidates, ctx) → PromotionOutcome`. It is called by the cart read, the
payment intent and the back-office group preview. `commerce/src/promo/promo.ts` is deleted.
`promotions.guard.test.ts` fails any other file that computes a promotion discount or reads
`promotion`/`promotion_use` outside the shared repository.

**Rationale**: The platform rule "money logic lives once" (payments, points). The cart and the intent
must agree to the cent (SC-003).

## R3 — The order reductions are worked out in

**Decision**:
1. **Item** promotions (percent or amount per qualifying unit), then **buy X get Y** on what item
   promotions left;
2. **Cart** promotions on the remaining eligible goods;
3. the **delivery fee** is computed by the existing engine on goods after 1–2 (as today), then
   **delivery** promotions reduce it.

Percentages round **down** per line. A cart discount is **allocated** to the lines it applied to in
proportion to their remaining price, largest-remainder in cents, so every line carries the exact cents it
lost (needed by refunds, R8). Nothing goes below zero; a cap limits the whole promotion, not each line.

**Alternatives**: cart-first (rejected: "20% off dairy" then "10% off everything" would discount the
discount's base differently from every reference platform).

## R4 — Combining

**Decision**: Candidates = every qualifying automatic promotion + the entered code's promotion. Let
`A` = all combinable candidates applied together (R3 order). For each non-combinable candidate `p`, `{p}`
alone. The winner is the option with the largest total discount to the shopper; ties → the option whose
promotion ends soonest, then the oldest. The outcome lists every candidate that did not apply with a
reason (`not_combined`, `below_minimum`, …), so the cart can say why (FR-017).

**Rationale**: The spec's rule, with no numeric priorities to configure.

## R5 — Uses are held at the payment intent and confirmed at payment

**Decision**: `promotion_use` rows have `status` `held | confirmed | released`. The intent, in its
transaction, locks each applied promotion (`SELECT … FOR UPDATE` on `promotion`), re-counts held (not
expired) + confirmed uses and amounts against total, per-customer and budget caps, and inserts `held`
uses with the window hold's expiry. The finalizer confirms them (replacing finalize step 10). Payment
failure, hold expiry and cancellation before fulfilment set `released`. A single-use code is protected by
a partial unique index on `promotion_use (code_id) WHERE status IN ('held','confirmed')`.

**Rationale**: SC-004 under concurrency. It mirrors the delivery-window hold (069/078), which already has
the same "last server moment before the charge" problem.

**Alternatives**: count at finalize only (today's model; rejected, it over-issues); a counter column
(rejected, a counter and the rows disagree).

## R6 — The price the shopper saw is the price charged

**Decision**: The intent request carries `expectedDiscount` (goods + delivery promotion total the client
showed). A mismatch is 409 `promotions_changed` with the new cart, nothing written — the same pattern as
`delivery_fee_changed` (077). Old app builds that do not send it are judged as today (no check), to keep
installed apps working.

## R7 — What an order keeps

**Decision**: `order_promotion` (one row per promotion applied: promotion id, code id and code text,
internal name, shopper headline, kind, goods amount, delivery amount — snapshots). `order_item.discount_amount`
(the cents this line lost). `order.discount_amount` stays as the goods discount total (every reader keeps
working); new `order.delivery_discount_amount`. Grand total = goods − goods discount + fee − delivery
discount. Old orders keep `order.promo_code` and need no backfill.

## R8 — Refunds use what the shopper paid for the line

**Decision**: `priceLines` prices a refund as the line's paid share:
`floor((unit × ordered − line.discount_amount) × qty / ordered)`, with the last units of a line taking any
remainder so a fully refunded line returns exactly what was paid. Cancellation already refunds "what
remains" and is unchanged, apart from releasing uses (R5). A delivery discount is refunded only with the
delivery fee (existing behaviour).

## R9 — State is one SQL function

**Decision**: `public.promotion_state(promotion_id, now)` returns `draft | scheduled | active | paused |
used_up | out_of_budget | ended | archived`, reading the switch, archive flag, dates and the
`promotion_use` counts. Admin lists, storefront reads, the engine's candidate query and the preview all
call it. Days/hours are not part of state (a weekday-lunch promotion is Active at 3 pm; it simply does not
apply then, and the cart says when it will).

## R10 — Display groups and how clients read them

**Decision**:
- `promotion_group` (stable `key`, name, description, sort) and `promotion_group_member` (group,
  promotion, position).
- Two read routes, both by a list of keys so Home is one call:
  - `GET /storefront/v1/promotion-groups?keys=home-hero,home-side,…` — public, everyone-audience
    promotions only, cached 60 s (the listing tier);
  - `GET /commerce/v1/promotion-groups?keys=…` — signed-in, adds first-order / new-customer /
    chosen-customer promotions and drops any over the shopper's per-customer cap; not cached.
  Signed-out clients call the first, signed-in clients the second.
- The migration creates `home-hero`, `home-side`, `home-between`, `offers` and `cart`, and places advertised
  codes: `carousel` → `home-hero` (and `offers`), `inline` → `home-between`, in `banner_position` order.
- An unknown key answers an empty group (FR-027).

**Compatibility**: `home.banners` is kept on the storefront home payload, built from `home-hero`
(placement `carousel`) and `home-between` (placement `inline`), because installed mobile builds read it
and there is no app-update mechanism. Marked `@deprecated — compatibility (094)`.

## R11 — Offers shown on products

**Decision**: Storefront product DTOs gain optional `offer: { promotionId, label }` for an Active,
everyone-audience item or buy-X-get-Y promotion covering the product (directly, by category or ancestor
category, or by brand, compared case-insensitively). One SQL fragment, `PRODUCT_OFFER_SQL`, joined by the
listing and product reads. Personal offers are not shown on listings (they appear in the cart).

## R12 — Shops

**Decision**: The shop money panel keeps `discount` (the goods discount total its refund arithmetic
balances against) and sends `promoCode: null` for orders placed after the change; the field is marked
`@deprecated — compatibility (094)` and shop screens stop rendering it. No other shop read touches a
promotion table (`promotions.guard.test.ts` covers `apis/edge-api/shop`).

## R13 — Live updates

**Decision**: A new ops kind `promotions`, announced by every admin promotion/group write, for back-office.
No customer-wide broadcast (no such scope exists); customer clients re-read a group whenever they show
it, within the 60 s listing tier (FR-034 as amended).

## R14 — Audience rules

- **First order**: the customer has no order that reached `paid` and was not cancelled.
- **New customers**: the customer's account was created on or after the promotion's start (or its
  creation if it has no start).
- **Chosen customers**: `promotion_customer` rows; added by search, or by uploading emails (unknown
  emails are listed back, not invented).
- **Signed-out**: only `everyone` promotions are offered; a code for a personal promotion asks the shopper
  to sign in.

## R15 — Single-use code batches

**Decision**: Up to 10,000 per request, 10 characters from an alphabet without look-alikes
(`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), optional prefix, unique against every code ever issued. Download is a
CSV produced by the admin route (no file storage).

## R16 — Routes and gateways

- **Staff gateway (admin)**: promotions list/create/read/update/delete, lifecycle action, audit,
  performance, codes generate/list/export, customers list/add/remove/upload, groups list/create/update/
  delete, group members put, group preview. ≈ 20 routes; the banner-image presign route is removed.
  Staff gateway 165 → ≈ 184 (61%).
- **Shared gateway**: storefront +1, commerce +1 → 165 (55%).
- No new service, no new compute.

## R17 — Observability

EMF metrics through the existing helper: `PromotionUseHeld`, `PromotionUseConfirmed`,
`PromotionUseReleased`, `PromotionRefused{reason}`, `PromotionsChanged409`. Analytics (typed taxonomy, no
PII): `promotion_published`, `promotion_paused`, `promotion_group_changed` (back-office);
`promotion_applied`, `promotion_code_refused{reason}`, `promotion_banner_tapped{groupKey}` (customer).
