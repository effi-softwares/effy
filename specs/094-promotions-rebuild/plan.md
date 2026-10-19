# Implementation Plan: Promotions Rebuilt — a Full Promotion System, Grouped for Display

**Branch**: `back-office-ui-redesign` (feature directory `094-promotions-rebuild`) | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

## Summary

The one-code promotion model (027/028/029) is replaced by a promotion that can be:
- **cart**, **item** (products, categories or brands), **buy X get Y** or **delivery**;
- **automatic** or **code** (one shared code, or batches of single-use codes);
- limited by **audience**, minimum spend or quantity, delivery type, dates, days and hours;
- capped by **total uses**, **per customer** and a **budget**, with a **combining** rule.

Display groups say where promotions are shown. Customer-web and the customer app read groups by key.

There is one evaluator, in `@effy/edge-shared/promotions` (R2), used by the cart read, the payment
intent and the back-office preview. Uses are **held at the intent and confirmed at payment** (R5), so
caps and budgets hold under concurrency.

Every order keeps what each promotion took off each line and the delivery fee (R7). Refunds return what
the shopper paid for a line (R8). Old codes and orders carry over by copy (R1). The old tables stay
read-only until a later removal stage.

Decisions: [research.md](research.md) R1–R17. Data: [data-model.md](data-model.md). Contracts:
[contracts/api.md](contracts/api.md). Validation: [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript (edge-api `shared`, `admin`, `commerce`, `storefront`, `orders`, `shop`, `notifications`; `shared-types`; back-office Vite/React 19; customer-web Next.js 16); Kotlin 2.4 / CMP 1.11 (customer app).
**Primary Dependencies**: none new.
**Storage**: PostgreSQL 16. Stage A: one goose migration (new tables, SQL function `promotion_state`, two columns, copy of old data, seeded groups). Stage C: a later removal migration for `promo_code`, `promo_redemption`, `cart.promo_code_id`, `order.promo_code_id`.
**Testing**: vitest unit + container tests (engine fixtures, concurrency of holds, refunds), back-office and customer-web vitest, KMP host tests, guard tests.
**Target Platform**: AWS Lambda behind the shared gateway (storefront, commerce) and the staff gateway (admin); web consoles; Android/iOS.
**Performance Goals**: a cart read prices promotions in one extra query (candidates + usage counts); group reads are one query per call and cached 60 s when public.
**Constraints**:
- Installed customer apps keep working: `home.banners`, `CartDTO.discount`, `POST/DELETE /cart/promo` and the intent without `expectedDiscount` are all kept (R6, R10).
- No refresh timers (071).
- Money logic lives once (R2).
- A shop never sees which promotion applied (R12).
**Scale/Scope**:
- Gateways: staff +≈19 routes (165 → ≈184, 61%), shared +2 (163 → 165, 55%).
- Back-office: Promotions rebuilt (list, editor, detail with performance, codes and customers; groups list and editor with preview).
- Customer-web and customer app: groups, product offers, cart/checkout/receipt lines.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec 094. Two requirements amended at planning: FR-034 (no customer broadcast) and FR-035 (shops keep the order discount total). |
| II. Shared contracts | ✅ | DTOs in `@effy/shared-types/promotion.ts`, mirrored as Kotlin wire types. The engine, `promotion_state` and `PRODUCT_OFFER_SQL` each have exactly one definition. |
| III. One backend | ✅ | Routes are added to existing services: `admin` (staff gateway), `storefront` and `commerce` (shared gateway). No new compute. |
| IV. Auth isolation | ✅ | Admin routes use the back-office authorizer. The personal group read uses the customer pool. The public group read carries no identity and serves everyone-audience promotions only. |
| V. Design / no cards | ✅ | Back-office uses tables, a sectioned editor and detail rows. Performance is shown as detail rows, not metric tiles. Customer banners keep their existing drawn look (out of scope). |
| VI. Layering | ✅ | handler → service → repository. The engine is pure. The shared repository is the only reader of the promotion tables (guard). |
| VII. Observability | ✅ | EMF metrics and analytics events (R17). No PII. |
| Hidden fulfilment | ✅ | No shop sees a promotion's name, code or terms (R12). No customer is told about suppliers. |
| Money lives once | ✅ | One evaluator. Uses have one writer (`@effy/edge-shared/promotions/uses.ts`). Refund pricing stays in `payments/refunds`. |

Post-design re-check: ✅. No complexity table. FR-020, FR-022 and FR-024 are enforced in the admin service inside the writing transaction, under the promotion row lock checkout also takes. The platform forbids triggers that can abort a write (shop trigger guard).

## Project Structure

```text
db/migrations/20261020090000_promotions_rebuild.sql                         NEW (stage A)
packages/shared-types/src/{promotion.ts(rewritten),cart.ts,checkout.ts,storefront.ts,catalog.ts,live.ts,analytics…}
apis/edge-api/shared/src/promotions/                                         NEW
  engine.ts            pricePromotions (R3/R4), pure
  terms.ts             the one composer of terms / endsIn / offer labels
  candidates.ts        candidate query + usage counts (the only reader of the tables)
  uses.ts              hold / confirm / release (the only writer of promotion_use)
  product-offer.ts     PRODUCT_OFFER_SQL
  promotions.guard.test.ts
apis/edge-api/shared/src/payments/finalize.ts                                step 10 → confirm uses; order_promotion written at intent
apis/edge-api/shared/src/payments/refunds/{repository.ts,service.ts}         paid-share pricing (R8); cancel releases uses
apis/edge-api/admin/src/promotions/*                                         rewritten; groups/*, codes/*, customers/*, performance/* NEW
apis/edge-api/admin/src/functions/promotion*-v1-*.ts                          new handlers; banner presign + status removed
apis/edge-api/commerce/src/{cart,checkout}/*                                  engine calls; promo/promo.ts DELETED; promotion-groups route NEW
apis/edge-api/storefront/src/{promotions,home,catalog}/*                      group read, home compat, product offers
apis/edge-api/orders/src/orders/*, notifications/src/receipts/*               order_promotion lines on back-office order + receipt
apis/edge-api/shop/src/orders/*                                               promoCode → null (deprecated)
apps/back-office/src/features/promotions/*                                    rebuilt (list, editor, detail, codes, customers, performance)
apps/back-office/src/features/promotion-groups/*                              NEW (groups list, group editor + preview)
apps/customer-web/app/(shop)/{page.tsx,home-composition.ts,_components/*,offers/*,promotions/*}  read groups
apps/customer-web/{components/storefront/*,app/cart/*,app/checkout/*,app/(account)/orders/*}     offers, promotion lines
apps/customer-mobile/shared/src/commonMain/kotlin/.../features/{catalog,cart,checkout,orders}/*  groups, offers, lines
```

## Delivery in stages (each deployable on its own)

- **Stage A — the model, cart promotions, groups (P1: US1, US2, US10).**
  - The migration, the engine (all kinds implemented and tested, but the editor offers only `cart` at
    first), holds, order records, refunds, and the group reads.
  - Back-office: the promotions list, the editor for cart promotions, lifecycle and audit, and the groups
    screens.
  - Customer-web and the app read groups and show the new cart lines.
  - The old banner editor and placement are removed from back-office.
- **Stage B — the other kinds and targeting (P2/P3: US3–US9).**
  - The editor gains item, buy-X-get-Y and delivery promotions, audiences, days and hours, budgets,
    single-use batches and performance.
  - Clients gain product offer labels and the "not applied" sentences.
- **Stage C — removal.**
  - A migration drops `promo_code`, `promo_redemption`, `cart.promo_code_id` and `order.promo_code_id`
    after their readers are gone.
  - It refuses to run while any cart still points at a `promo_code`.

## Implementation notes

- **Rounding and allocation** are tested by fixtures shared between the engine tests and the cart and
  intent tests, so the three places cannot drift (SC-003).
- **The hold** reuses the intent's transaction and the window hold's expiry. A second intent for the same
  cart releases the first intent's held uses before holding new ones.
- **Days and hours** use the platform's Melbourne clock helper. The cart says "Available weekdays
  11 am–2 pm" when the time rule is what blocks a promotion.
- **Products** that are personal-only show no listing offer; the cart applies them.
- **Back-office editor** is a page (as Create code was in the redesign) with a live "Summary" read back
  in words from `terms.ts`. That is the same composer the clients use, so staff read exactly what
  shoppers will.
- **Kotlin**: wire types are regenerated from shared-types. The app keeps decoding `home.banners` for one
  release after it moves to groups.

## Deploy order

1. Stage A migration (it adds tables and copies data; old readers are unaffected).
2. `admin`. Back-office writes now go to the new tables; old codes were copied.
3. `storefront` and `commerce` together. The engine replaces `evaluatePromo`.
4. `orders`, `notifications` and `shop` (readers).
5. Back-office, then customer-web, then the app.

Stage B needs no migration beyond stage A. Stage C runs last, after a release in which nothing reads the
old tables.
