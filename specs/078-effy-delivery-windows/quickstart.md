# Quickstart & Validation: Effy Delivery Windows (078)

Proofs are automated and each is **broken once on purpose** before it is trusted. Walks are by hand in
dev. Operator steps are at the end — Claude runs none of them.

## Proofs

| # | What | Where | How it is broken once |
|---|---|---|---|
| P1 | 10:00, cutoffs 09:00/14:00/17:00 → today lacks the 09:00 window; each of the next 3 delivery days has all three | `shared/src/delivery/windows.test.ts` | drop the cutoff test |
| P2 | After the last cutoff → today `closed`, later days intact | same | — |
| P3 | Non-delivery weekday and date skipped, still 3 days; today non-delivery → `not_delivery_day` | same | count skipped days toward the look-ahead |
| P4 | Today's window with no makeable collection run → absent; the same window tomorrow → present | same | run the collection test on every day |
| P5 | Clocks: 23:59→00:00; 2026-10-04 (forward); 2027-04-04 (back) — windows keep wall-clock times, no day repeats or vanishes | same | local-midnight + 24 h arithmetic |
| P6 | A full window on Thu leaves Fri untouched (real view) | `shared/src/delivery/windows.container.test.ts` | load by slot only |
| P7 | Two transactions race the last place on a later date → exactly one hold | same | remove `FOR UPDATE` |
| P8 | Late payer on a later date → confirmed + `over_capacity`; staff order detail shows it | `shared/src/payments/finalize` container | — |
| P9 | Model **off** → quote byte-equal to before (`wire.contract.test.ts`, unchanged), `effyWindows` absent; a window sent anyway is ignored | `commerce/src/checkout/checkout.container.test.ts` | read the switch column directly with a typo'd time |
| P10 | Model **on** → `effyWindows` days/windows; intent with `deliveryWindow` holds a place on that date; packages written `same_day` (today) / `standard` + window (later day); no split ever | same | honour the per-shop bridge in the v2 path |
| P11 | Model on, intent without `deliveryWindow` → `slot_required`; stale date → `date_unavailable`; nothing open → `no_windows_available`; none defined → metric emitted | same | — |
| P12 | Surcharge per window per day = `priceEffyOrder`; today premium only on today's windows; free basket → every surcharge `0.00`; charged = shown | same | pass `windowIsToday: true` for every day |
| P13 | Slot edited, limit lowered, switched off, date marked non-delivery → placed order's page, receipt and email unchanged | `commerce/src/orders` + `notifications/src/receipts` container | — |
| P14 | Guard: `delivery_model_v2_from` read only by the SQL function; the function read only via `deliveryModelV2At`; `clockOn` is the only slot→instant conversion | `shared/src/delivery/windows.guard.test.ts` | add a second reader |
| P15 | Fleet `GET delivery-slots`: `days[]` skips non-delivery days, `load[]` equals the view per date | `fleet/src/slots/slots.container.test.ts` | — |
| P16 | Handoff refuses a windowed `standard` package (`not_carrier`); promise judges it by its window; non-delivery-date count includes it | `orders` container tests, `fleet/src/deliverydays` | — |
| P17 | Words: the TS constants and `DeliveryWindowWords.kt` match | `apps/customer-mobile` `commonTest` | edit one side |
| P18 | One quote fixture rendered by web (`DeliveryOptions.test.tsx`) and mobile (`CheckoutViewModelTest`) — same sections, days, windows, surcharges, sentences | both | — |
| P19 | Back-office `SlotsPanel` grid: rows = windows, columns = days, "booked / limit", over-limit marked; updates on a `slots` live kind | `SlotsPanel.test.tsx` | — |
| P20 | Existing guards stay green: `change-map.guard`, `coverage.guard`, `fee.guard`, `check-no-refresh-timers.sh`, `check-token-usage.mjs`, gateway capacity (no route added) | repo | — |

Run: `pnpm --filter @effy/edge-shared test`, `pnpm --filter @effy/edge-commerce test`, `pnpm --filter
@effy/edge-fleet test`, `pnpm --filter @effy/edge-orders test`, `pnpm --filter @effy/back-office test`,
`pnpm --filter @effy/customer-web test`, `cd apps/customer-mobile && ./gradlew :shared:allTests`.

## Operator steps (dev)

1. `make db-up ENV=dev` — applies the one additive migration. Safe before the deploy: the running
   code never reads the new columns and the relaxed CHECK only widens what is allowed.
2. Deploy `SERVICE=commerce`, `SERVICE=fleet`, `SERVICE=orders`, `SERVICE=notifications` (any order —
   with the switch NULL nothing a customer sees changes).
3. Build back-office and customer-web (CI on push to `dev`); ship the customer mobile build.
3a. `make apply ENV=dev` — one new alarm (`EffyWindowsNoneDefined`).
4. **The switch stays NULL.** It is turned on by E9's go-live step, after E5 and E8.
5. *(Optional, dev only, to walk V5–V10)*: `UPDATE public.delivery_settings SET delivery_model_v2_from
   = now() WHERE id = 1;` — and **set it back to NULL afterwards**. ⚠ While it is on, a later-day order
   gets no driver round (E8) and must be cancelled by hand.

## Walks (dev)

- **V1** Switch off: checkout on web and mobile looks exactly as before.
- **V2** Back-office → Delivery → Windows: grid shows today + 3 delivery days; mark Sunday non-delivery
  → the grid skips it.
- **V3** Set "Days offered" to 2 → grid shows today + 2; customer quote (switch on) offers 2.
- **V4** Mark a date non-delivery that an order carries → the count is shown; the order is unchanged.
- **V5** (switch on) Web checkout at 10:00: Same-day shows open windows with "Order by …"; Standard
  shows 3 day tabs with windows and surcharges.
- **V6** Pick Thursday 4–6 pm, pay → order page, receipt and email say "Standard delivery · Thursday
  9 Oct, 4–6 pm"; the grid's Thursday cell goes up by one without a reload.
- **V7** Set a Thursday window's limit to its booked count → it disappears from Thursday only.
- **V8** Two browsers race the last place → one pays, the other is told and chooses again, uncharged.
- **V9** Switch every window off → the plain sentence; Pay is disabled; the alarm fires.
- **V10** The same as V5–V6 in the mobile app.
