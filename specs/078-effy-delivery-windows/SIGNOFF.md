# Sign-off: 078 — Effy Delivery Windows: today and the next delivery days

**Status (2026-10-09)**: **built, checked by machine, migrated and deployed to dev — reported by the
operator. NOT walked by a person, and still switched off.** The machine checks below ran on local
containers and test runners; I did not read dev itself. 62/62 tasks.

Not confirmed either way: `make apply ENV=dev` (the `EffyWindowsNoneDefined` alarm), the back-office and
customer-web builds, and a customer mobile build.

## What changed

- **One window for the order.** Under the new delivery model a customer picks one delivery window:
  today's under **Same-day delivery**, or one on the next three delivery days under **Standard
  delivery**. "Standard" keeps its name and now means *Effy, on a later day, in a window* (operator
  decision, 2026-10-08).
- **The same windows repeat every delivery day, and each has its own room on each day.** A window is
  offered today while its cutoff has not passed, it has room, and a collection run can still reach the
  hub before it starts; on a later day while it has room. Non-delivery weekdays and dates are skipped
  and do not count toward the days offered.
- **Paying never costs the customer their window.** The place is held on its own day at the
  payment-intent call; a window that has gone is refused before any charge and never replaced; a late
  payer into a window that has since filled keeps it and is flagged to staff.
- **Staff** see how full each window is on today and each delivery day after it, and set how many days
  are offered (1–14, default 3).
- **A delivery sold a window is Effy's, whatever it is called.** Carrier handover, the handover list,
  the orders list's "needs handover" and the on-time check read the window, not the word "standard".

## ⚠ Switched off

`delivery_settings.delivery_model_v2_from` is created NULL. **No route, seed or migration sets it.**
While it is NULL every customer is offered exactly what they are offered today.

It must stay off until the driver side can deliver a later-day window (E8): the planner gathers
same-day packages only, so a later-day order would be collected and then never put on a round. E9 adds
the setter behind its go-live checklist.

## ⚠ One thing a customer will see on release, switch or no switch

Order pages and receipts used to say one arrival **per supplier package**: a three-supplier order
showed three identical arrivals on its page and "Multiple deliveries" on its receipt — which told the
customer how many suppliers filled it. Identical promises are now said once. An order genuinely split
across today and a later day still shows both.

## Proofs — each broken once

| # | Proof | Where | Broken by | Result |
|---|---|---|---|---|
| P1 | Cutoff closes a window today, not tomorrow | `shared/src/delivery/windows.test.ts` | removing the cutoff test | failed (2) |
| P3 | Non-delivery days skipped and not counted | same | counting a skipped day | failed (1) |
| P4 | Collection is judged today only | same | judging it on every day | failed (4) |
| P5 | Midnight and both daylight-saving change days | same | stepping days as local midnight + 24 h | failed (5), both clocks-back cases among them |
| P6 | A full window on one day leaves the next untouched | `commerce/src/checkout/checkout.container.test.ts` | reading load without the date | failed (3) |
| P7 | The last place has one winner | same | removing the slot row lock | failed (1) |
| P9 | Switch off ⇒ the old quote, byte for byte | `commerce/src/wire.contract.test.ts` (unchanged) + container | the switch reading "on" | failed (1) |
| P10 | One window, never a split | container | consulting the per-shop same-day bridge | failed (1) |
| P12 | Today's premium only today; charged = shown | container | treating every day as today | failed (2) |
| P14 | One reader of the switch | `shared/src/delivery/windows.guard.test.ts` | naming the column in a second file | failed (1) |
| P16 | A windowed package is refused for carrier handover | `orders/src/handoff/handovers.container.test.ts` | removing the refusal | failed (1) |
| P16 | Closing a date counts windows too | `fleet/src/slots/slots.container.test.ts` | counting carrier days only | failed (1) |
| P17 | The app's words are the website's words | `packages/shared-types/src/effy-windows.test.ts` | changing one Kotlin sentence | failed (1) |

Passing, not broken on purpose: P2, P8 (late payer on a later day), P11 (each refusal; `no_windows` /
`none_defined`), P13 (a placed order keeps its window after the slot is edited, limited, switched off
and its date closed), P15 (the fullness grid equals the view), P18 (one fixture, website and app), P19
(back-office grid), P20 (existing guards).

## What ran

| Suite | Result |
|---|---|
| `pnpm -r typecheck` | clean |
| `pnpm -r test` (unit, whole repo) | exit 0 |
| Containers: `shared` 800, `commerce` 317, `fleet` 292, `orders` 99, `notifications` 68, `driver` 177, `admin` 248, `storefront` 180, `customer` 221, `inventory` 64, `catalog` 43, `ops` 22 | pass |
| Containers: `shop` | 476 pass, **2 fail — not this feature** (below) |
| customer-web checkout | 134 pass, run three times |
| back-office delivery + orders | pass |
| customer-mobile `:shared:testAndroidHostTest` | 408 pass |
| `check-no-refresh-timers.sh`, design-system guards, gateway capacity | pass (no route added) |

- ⚠ **`orders` containers failed twice on the first full run** (an arrival race test and a status
  test, both timing out with eleven containers starting at once) and passed on two reruns. I am
  reporting it as a timing flake under load, not as verified stable.
- ⚠ **Two `shop` container tests are red with and without this feature** — I moved the migration out
  and they failed identically; `apis/edge-api/shop` has no change in this feature:
  `attention/repository.container.test.ts` (`column "id" does not exist`) and
  `orders/repository.container.test.ts` ("pages with a total order and a stable total").
- `make cm-contract-check` reports a difference only because the regenerated contract is not committed yet.

## Not done here, on purpose

- Driver planning for a later day, parcels waiting at the hub, chilled goods overnight — **E8**.
- The courier option when no window is available, and `order.delivery_type` — **E5**.
- The switch's setter and readiness check; renaming "slot" to "window" on the back-office screen;
  deleting `standard-days.ts` and the old half of the quote — **E9**.
- The mobile app declares its two analytics events and emits neither, like the rest of its commerce
  taxonomy. The website emits both.

## Operator steps (dev)

```
make db-up ENV=dev                               # one additive migration; safe before the deploy
make edge-deploy SERVICE=commerce ENV=dev
make edge-deploy SERVICE=fleet ENV=dev
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=notifications ENV=dev
make apply ENV=dev                               # one alarm: EffyWindowsNoneDefined
```

Then the back-office and customer-web builds (on push to `dev`), and a customer mobile build.

**Leave the switch NULL.** To walk V5–V10 in dev only:

```sql
UPDATE public.delivery_settings SET delivery_model_v2_from = now() WHERE id = 1;
-- walk, cancel any later-day order placed, then:
UPDATE public.delivery_settings SET delivery_model_v2_from = NULL WHERE id = 1;
```

## Walks still to do

V1–V4 with the switch off (checkout unchanged; the grid; "Days offered"; closing a date).
V5–V10 with it on, in dev, by hand — see [quickstart.md](quickstart.md).
