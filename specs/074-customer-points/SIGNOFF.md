# Sign-off: 074 — Customer Points (store credit)

**Status (2026-10-08)**: **code-complete and machine-verified. NOT deployed, NOT committed, NOT walked
by a person.** 90/90 tasks; three carry a recorded deviation (below). The walks in
[quickstart.md](quickstart.md) (V1–V7) remain, after the operator steps.

## What changed

- **A points balance per customer**, as an append-only ledger. The balance is never stored: one database
  function (`public.points_usable`) computes it from the entries. One shared module
  (`@effy/edge-shared/points`) is the only writer.
- **Back-office → Customers** (new): find a customer by order number or email; see balance, held
  points, next expiry and full history; **Credit points** (a customer-service agent up to the limit),
  **Remove points** (admin, manager), **Points settings** (admin, with a change log). "Credit points…"
  also sits on every order.
- **The customer** sees balance and history on web (Account → Effy points) and mobile (Account → Effy
  points), updated live, and gets an email + push when points are credited.
- **Checkout**: "Use points" on web and mobile. The order total is unchanged; the card pays the rest.
  An order paid entirely with points never touches the payment provider.
- **Refunds and cancellations** split between card and points in the proportion the order was paid.
  Only the card part goes to the provider. Points come back once.
- **Expiry**: points stop counting the instant they expire (no job needed); a daily job writes the
  "Expired" history line and queues one warning email per customer per expiry date.
- **Account closure** tells the customer how many points they will lose.
- **Two alarms**: a late payer's shortfall, and a ledger that does not add up (checked hourly).

## Verified by machine

| Check | Result |
|---|---|
| `pnpm -r typecheck` | clean |
| Migration chain on a fresh PostgreSQL (Up), 074 Down then Up again | clean |
| edge-shared (with containers) | 638 passed |
| edge-commerce (with containers) | 295 passed |
| edge-customer (with containers) | 220 passed |
| edge-orders (with containers) | 95 passed |
| edge-shop (with containers) | 476 / 478 — both failures pre-date 074 (recorded under 073) |
| edge-notifications | 64 passed |
| admin · fleet · driver · storefront · catalog · inventory · live | all passed |
| shared-types · email-kit (+ `email-check`) · legal-content | 71 · 94 · 9 passed |
| back-office · shop-web · customer-web | 297 · 450 · 613 passed |
| customer-mobile · driver-mobile · shop-mobile host tests | passed |
| customer-mobile `compileKotlinIosSimulatorArm64` | clean |
| `check-no-refresh-timers.sh`, design-system guards, emerald/jade sweeps | OK |

**Proofs broken once and caught** (a guard that cannot fail proves nothing): refund-split rounding (P1),
FIFO order (P2), debit without the balance check (P5), late payer spending the full hold (P7), card
minimum removed (P9), points not returned on submission (P10), an `UPDATE` on the ledger from another
service (P13), a customer update built outside the allowed files (P14). Each turned its test red and
was restored.

**Not broken by mutation** (covered by passing tests only): P3, P4, P6, P8, P11, P12, P15, P16.

## Defects found while building

- ⚠ **A shop could have learned an order was paid with points.** The shared refund result gained
  `cardAmount` / `pointsReturned`, and the shop-manager refund route returns that result as-is. Found by
  writing the isolation test (T087). The route now strips the split (`withoutPaymentSplit`), and
  `shop/src/points-isolation.contract.test.ts` pins it.
- ⚠ **A points-only checkout could have left a payable card intent behind.** A customer who started a
  card payment and then switched to all-points would keep a live intent for an order already paid.
  The gateway gained `cancelPaymentIntent`; the checkout cancels the old intent first, and if the
  provider says it was already paid, settles that and refuses the points payment.
- ⚠ **A provider webhook can settle a refund before `markSubmitted` runs**, skipping the "submitted"
  step where points were returned. Points are now also returned when a refund settles as succeeded or
  failed; the return is idempotent per refund, so it happens once whichever path runs first.
- ⚠ **The mobile payment screen showed and charged the order total, not the card amount** (it feeds the
  wallet sheet). It now uses the card amount.
- **With a point worth more than one cent, some refund amounts cannot be split exactly** when little
  card money is left. Such a refund is refused with a plain message rather than rounded (FR-019). It
  cannot happen at the default of one cent.
- **`live_kinds` in Terraform** needed `points` (the live-update failure alarm names every kind); the
  existing contract test caught it.

## Deviations from the plan

| Task | What differs |
|---|---|
| T043 | No push deep link wired: the customer app routes **no** push tap today, for any type. The server sends `effy://points` and the screen exists. |
| T048 | The quote carries `usable`, `centsPerPoint`, `cardMinimumAmount` — not `maxForThisOrder`: the total depends on the delivery choice still to be made. Web works out the maximum; mobile sends the balance and retries once with the maximum the server returns. |
| T069 | Not applicable: the `order-refunded` email template exists but nothing sends it. |
| T006 | The shopper role gets DML through 070's default privileges; the migration **revokes** UPDATE/DELETE on the ledger tables instead of granting. |

## Not verified

- Nothing has run against dev. No real payment, refund, email or push has been sent.
- Legal: the points terms (promotions-terms **v2**) are a draft. The document set is still
  publish-blocked on the operator's identifiers and a lawyer's review, as before 074.
- The website's points maximum ignores a promo discount (its order summary always has); with a promo
  the server refuses the excess and the page asks for fewer points.
- Forfeiture at final closure is implemented and tested, but its caller — the account-erasure worker —
  does not exist yet (`docs/next-implementation-candidates.md` item 3).

## Operator steps

```sh
make db-up ENV=dev                                   # 20261008043114_customer_points.sql (additive)
make edge-deploy SERVICE=notifications ENV=dev       # FIRST — it must know the two new types
make edge-deploy SERVICE=commerce ENV=dev            # ┐ together: an order paid with points must never
make edge-deploy SERVICE=orders ENV=dev              # │ meet a refund path that does not know about
make edge-deploy SERVICE=shop ENV=dev                # ┘ points
make edge-deploy SERVICE=customer ENV=dev            # balance, history, the two scheduled jobs
# terraform plan/apply in infra/envs/dev: live.tf (kind `points`), commerce-alarms.tf (2 alarms),
#   background-functions.tf (2 alarms)
# back-office and customer-web through their pipelines; build customer-mobile
# optional: psql "$DSN" -v customer_email='<a dev customer you own>' -f db/seeds/074_points_dev.sql
```

⚠ `notifications` goes first: 059's rule — a producer writing a type the worker does not know yet is
skipped safely only because the worker checks the type, but the message is not sent until it deploys.

Then walk V1–V7 in [quickstart.md](quickstart.md).
