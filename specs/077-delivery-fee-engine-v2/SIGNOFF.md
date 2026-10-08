# Sign-off: 077 — Delivery Fee Engine v2

**Status (2026-10-08)**: **built and checked by machine. NOT migrated, NOT deployed, NOT walked.**
Everything below ran against local containers and test runners; nothing has touched dev. The operator
steps are at the end, and the first needs a number only the operator can give. 82/82 tasks; T016 was
withdrawn during implementation (below).

## What changed

- **One delivery fee per order**, never per shop: base + distance band + weight band + window surcharge,
  rounded **up**, held between a minimum and a maximum; **$0** at or above the free-delivery amount
  (surcharge included); a **small-order fee** added below its amount, outside the maximum. One function
  adds it up (`effyFee` in `apis/edge-api/shared/src/delivery/engine.ts`); checkout and the simulator
  both call it.
- **Distance tiers and the same-day multiplier are gone.** A postcode is priced from its own distance
  (076's list); a delivery today costs a **fixed amount** more (the plan's "Delivery today" surcharge).
  A window may also carry its own surcharge on any day. Surcharges belong to the plan, never the window.
- **Courier pricing**: a plan of kind `courier` — a flat amount per order plus weight bands, its own
  optional free amount. Charged to nobody yet; **courier delivery cannot be switched on without one in
  force** (new refusal `courier_plan_missing`).
- **Fee plans**: drafts, one active per kind, retired ones kept. Saving refuses bad values field by
  field; activation refuses gaps, each named in words; a $0 minimum must be confirmed; a plan that has
  been active cannot be edited or brought back — it is copied. One SQL function activates.
- **The customer** sees named lines before paying (Delivery · Window surcharge · Small-order fee · Free
  delivery), each window's surcharge before choosing it, and "Spend $N more for free delivery". The
  intent call refuses (409 `delivery_fee_changed`, nothing written) when the total it would charge is not
  the one shown. The order stores how its fee was built; the order page, receipt and email show the
  stored lines forever.
- **Staff** get a Pricing tab (plans, editor, activation, simulator) and "How the delivery fee was built"
  on every order placed since 077.
- **Shops** no longer see the order's delivery charge (the shop console's "Shipping" row is gone).

## Machine checks (2026-10-08)

| Check | Result |
|---|---|
| `pnpm -r typecheck` | clean |
| `@effy/edge-shared` (containers) | 769 / 769 |
| `admin` 246 · `commerce` 304 · `fleet` 288 · `driver` 177 · `storefront` 180 · `customer` 221 · `notifications` 67 · `catalog` 43 · `inventory` 64 · `ops` 22 | all pass |
| `orders` | 94 / 95 under parallel load; the one (`recordArrival` — two operators at the same instant) passes 4/4 on its own and at HEAD — a timing race, not 077 |
| `shop` | 476 / 478 — **the 2 failures are pre-existing**: they fail identically with every 077 change stashed (attention recipients; order-console pagination) |
| `@effy/shared-types` 74 · `@effy/email-kit` 97 + email-check | pass; Kotlin contracts regenerate byte-identically |
| customer-web 622 · back-office 329 · shop-web 450 | pass |
| customer-mobile `:shared:testAndroidHostTest` | 398 tests, 0 failures (incl. the 077 view-model, mapper, wire and parity tests) |
| customer-web production build + bundle budget | builds; every route within budget |
| `check-no-refresh-timers`, design-system guards, `make validate ENV=dev`, gateway capacity | pass |
| Real `goose` against a scratch Postgres | all migrations up; both 077 Downs step back; dev seed runs **twice** cleanly |

## Proofs, each broken once to see it fail

| # | Broken by | Caught |
|---|---|---|
| P1 | rounding down | ✓ |
| P4 | free delivery that kept the surcharge | ✓ |
| P6 | a surcharge line at its nominal amount when capped | ✓ |
| P15 | carrying a DISABLED tier's price across | ✓ |
| P16 | every postcode taking the open band | ✓ |
| P3 | pricing the first package only | ✓ |
| P7 | no monotonic check | ✓ |
| P8 | activation lock AND one-active index both removed | ✓ in 2 of 3 runs (a race). Either guard alone holds; removing the lock alone did not fail |
| P20 | a distance field on the customer fee | ✓ |
| P21 | a tier read in a source file | ✓ |
| P22 | a second place adding fee parts | ✓ |

P15 also runs through the **real goose binary** (`fee.goose.container.test.ts`): unset or off-step
`EFFY_TODAY_PREMIUM` stops it with nothing applied; set, the amount lands and the `$$` bodies survive.

## Withdrawn, and why

- **T016 — the immutability trigger.** Built, then removed: the platform permits database triggers only
  to mark analytics buckets and never to raise inside another writer's transaction
  (`shop/src/db/triggers.guard.test.ts`, 058 R6), and that guard caught it. "An active plan is never
  changed" is held by `pricing.repository.ts` under the plan's row lock; nothing deletes a plan; P9
  proves both.

## Found while building

- **076's dev seed could not be run twice** — removing a group no longer deletes its postcodes, so the
  second run hit a duplicate. Fixed in `db/seeds/047_delivery_dev.sql`, which 077 also rewrote (no tiers).
- **The web cart has no postcode until checkout**, so on the website the free-delivery hint and the
  small-order notice appear at checkout. The storefront's serviceability answer carries the offer for a
  surface that knows a postcode earlier.
- **"2 of your 3 deliveries can arrive today"** still appears for a split same-day order (a 069
  sentence). It is the same-day flow's, which E5 replaces; spec assumption records it.

## Not done here, on purpose

- **Customer-facing analytics on mobile** are declared (`delivery_fee_viewed`,
  `checkout_delivery_fee_changed`) but not emitted — the app's whole commerce taxonomy is declared-only.
- **Shops still see the customer's order total**, from which the delivery charge can be worked out.
  Raised with the operator, not decided.

## Operator steps (dev) — in this order

0. **Choose the same-day amount**: how much dearer a delivery today is than a later day (e.g. `3.00`).
   It must be a multiple of the active plan's rounding step.
1. **Run `specs/077-delivery-fee-engine-v2/preflight.sql` (read-only).** First line: the standard
   multiplier — anything but 1 and the migration will refuse. Then the postcodes whose fee moves (a tier
   picked by hand, or one tier for a whole zone), with both fees.
2. **Commit**, then `EFFY_TODAY_PREMIUM=<amount> make db-up-one ENV=dev` — the fee engine migration
   ONLY. ⚠ Not `make db-up`: that would also drop the tiers the running checkout still reads.
3. Deploy, in order: `commerce`, `storefront`, `notifications`, `orders`, `shop`, then `admin` with the
   back-office build close behind (`make edge-deploy SERVICE=<s> ENV=dev`).
4. `make plan ENV=dev && make apply ENV=dev` — live kind `pricing`.
5. `make db-up ENV=dev` — drops the tiers.
6. `make gateway-usage ENV=dev` — expect staff 146, shared 158.
7. Push customer-web, back-office and shop-web; build customer-mobile.
8. Walks V1–V17 in [quickstart.md](quickstart.md).

⚠ An app built before 077 keeps working: the quote still carries per-package fees, arranged so such an
app never shows less than it is charged.
