# Sign-off notes: 079 — Checkout & Orders: Delivered by Effy vs Courier delivery

**NOT SIGNED OFF.** This is the builder's record for the operator to sign against.

**Status (2026-10-09)**: **built and checked by machine. NOT migrated, NOT deployed, NOT walked by a
person.** Every check below ran on local containers and test runners; nothing here read or changed dev.
61/61 tasks ticked, with the gaps listed under "Not done".

## What changed

- **One delivery type per order**, decided from the address: **Delivered by Effy** (078's window
  picker, Effy's fee) or **Courier delivery** (no picker; the business's estimate, said as an estimate;
  the courier fee). The order records its type, why, the estimate as sold, and an append-only history
  whose first entry is written at payment.
- **Courier is promised only where it can be sold.** `coverage_for_postcode` answers "courier" only
  when the new delivery model is on, courier delivery is on, a courier fee table is active and an
  estimate is set. The address book, the storefront check, the staff checker and the checkout therefore
  cannot disagree, and courier can be set up in back-office ahead of the cutover.
- **The client says which type it showed.** A mismatch with the server's answer — or a courier order
  not asked for by name — is refused before anything is written.
- **Who takes a package is one database function** (`package_delivered_by`), for old orders and new.
  Carrier handover, "needs handover", the on-time check, the shop label and the back-office column
  read it.
- **Customers**: order list, order page, receipt and email say who delivers; a courier order shows the
  estimate it was sold and no arrival.
- **Shops**: "Effy driver" / "Courier" everywhere; the words "same-day" and "standard" are gone and a
  guard keeps them out.
- **Back-office**: a Delivery column and filter, a Delivery type section with history, and the courier
  estimate, readiness and no-window fallback on the Coverage tab.

## ⚠ Rides 078's switch

`delivery_settings.delivery_model_v2_from` stays NULL; nothing here sets it. While it is NULL the
checkout, its fees, its orders and the out-of-area refusal are today's — proven with courier fully
armed (P3). Orders sold by today's checkout get **no** delivery type and no history.

## ⚠ Two things that change on release, switch or no switch

1. **Shop screens** (web and app) say "Effy driver" / "Courier" instead of "Same-day" / "Standard", for
   every package old or new. The shop app also stops printing the constant word "standard" it had been
   showing as a service level.
2. **Back-office** gains the Delivery column, filter and section, and the courier settings.

Nothing a **customer** sees changes: the email and the receipt pill keep their existing wording for
orders Effy delivers.

## Proofs — each broken once

| # | Proof | Where | Broken by | Result |
|---|---|---|---|---|
| P1 | A courier is promised only once the model is on | `shared/.../coverage.container.test.ts` | removing the switch condition | failed (1) |
| P3 | Switch off + courier armed ⇒ today's checkout, untouched | `commerce/.../checkout.container.test.ts` | coverage ignoring the switch | failed (1) |
| P4 | The courier fee is the courier table's | same | pricing with the Effy plan | failed (1) |
| P6 | The type shown must be the type that applies | same | trusting the client | failed (1) |
| P7 | Changing address gives up the held place | same | not deleting the booking | failed (1) |
| P8 | The first history entry is written once | `shared/.../delivery-type.container.test.ts` | removing the conflict target | failed (1) |
| P10 | Courier fallback only when no window is open | commerce container | offering it while one is | failed (1) |
| P13 | One writer of the history | `shared/.../delivery-type.guard.test.ts` | a second INSERT | failed (2) |
| P18 | No customer delivery words on shop screens | `scripts/check-shop-delivery-words.sh` | restoring one label | failed |
| P21 | A window does not follow the shopper to another address | `customer-web/.../CheckoutFlow.courier.test.tsx` | removing the reset | failed (1) |

Passing, not broken on purpose: P2, P5, P9, P11, P12, P14, P15, P16 (shared fixture: TypeScript and both
Kotlin twins), P17, P19, P20, P22, P23.

## What ran

| Suite | Result |
|---|---|
| `pnpm -r typecheck` | clean |
| Containers: `shared` 823, `commerce` 326, `storefront` 180, `orders` 108, `admin` 248, `notifications` 71, `customer` 221, `fleet` 292, `driver` 177, `catalog` 43, `inventory` 64 | pass |
| Containers: `shop` | 480 pass, **1 fail — not this feature** (below) |
| `@effy/shared-types` 97 · `email-kit` 97 + email-check | pass |
| customer-web 660 · shop-web 450 · back-office 343 | pass |
| customer-mobile `:shared:testAndroidHostTest` 423 · shop-mobile (incl. 3 new) | pass |
| Guards: `windows.guard` (unedited), `coverage.guard`, `fee.guard`, `delivery-type.guard`, gateway capacity (no route added), `check-no-refresh-timers.sh`, `check-shop-delivery-words.sh`, design-system, jade/emerald/phantm sweeps | pass |

- `make cm-contract-check` / `sm-contract-check` report a difference only because the regenerated
  Kotlin contracts are not committed yet (they compare against git).
- No Terraform change. No route added on either gateway.

## Defects found outside the feature

- ⚠ **Fixed — `orders`: recording an arrival or a handover raced.** The row lock and the "already
  recorded?" read were one statement; a second caller that waited was given the updated package beside
  a stale join and was **refused** instead of replayed. 078's sign-off had this down as a flake under
  load; with this feature's extra tests it failed on every full run. Now: lock first, then read. Three
  full `orders` runs green afterwards.
- ⚠ **NOT fixed — `shop`: `recipientsForShop` names columns that do not exist**
  (`apis/edge-api/shop/src/attention/repository.ts`: `shop_staff_role.shop_staff_id` / `shop_role_id`,
  `shop_role.id` / `name`; the schema has `staff_id` / `role_key`, `shop_role.key`). Its container test
  is the one red test, and was red before 078. It decides who is sent shop attention notifications, so
  fixing it changes what is sent — the operator's call.
- Fixed — `orders`: the order page counted an Effy later-day package as "awaiting handover" (it had
  missed 078's rule).
- Fixed — `shop`: a paging test still expected oldest-first after the default became newest-first.

## Existing tests that had to change

`orders/promise.test.ts` (the function now takes who delivers instead of the method),
`orders/repository.container.test.ts` (its hand-written schema needed the new columns; the function is
now taken from the real migration), the 076 coverage tests in `shared` and `admin` (rewritten for the
new rule), `shop` list-filter unit tests (a seventh filter parameter), and three one-line fixture or
call-site updates in `shared` and `commerce`.

## Not done

- **No end-to-end browser test** (backlog E5-T25). The flows are covered by component tests.
- **No storefront serviceability container test**: none exists to extend; the route is one call to the
  function `shared` tests.
- The mobile app declares its two analytics events and emits neither, like the rest of its taxonomy.
- Per-courier-service estimates, courier pickup timing, the driver app's "Standard" at hub check-in — **E6**.
- Staff changing an order's type, and compensation — **E7**. The writer exists.
- The same-day bridge, the compatibility per-package fee, the "N of your M deliveries" sentence, and
  dropping `deliveryMethod` from the shop wire — **E9** (moved from E5: today's checkout reads them).

## Defaults still to confirm

Settled without asking, in the spec's Assumptions: one switch shared with 078; the no-window courier
fallback in scope, off by default; one platform-wide estimate text until E6; courier parcels go via the
hub as "standard" parcels do today; old orders are not relabelled for customers.

## Operator steps (dev)

```
make db-up ENV=dev                               # one additive migration; safe before the deploys
make edge-deploy SERVICE=notifications ENV=dev
make edge-deploy SERVICE=commerce ENV=dev
make edge-deploy SERVICE=storefront ENV=dev
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=shop ENV=dev
make edge-deploy SERVICE=admin ENV=dev
```

⚠ **Migrate first.** `commerce`, `orders`, `shop` and `notifications` now read columns and functions the
migration adds.

Then the web builds (customer-web, shop-web, back-office — on push to `dev`) and the customer and shop
mobile builds. **Leave the model switch NULL.**

## Walks still to do

V1–V3 with the switch off; V4–V11 with it on, in dev, by hand — see [quickstart.md](quickstart.md).
