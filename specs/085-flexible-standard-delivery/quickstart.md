# Quickstart: validating Flexible Standard Delivery (085)

How to prove the feature works. Contracts: [contracts/wire.md](contracts/wire.md). Data:
[data-model.md](data-model.md).

⚠ **The operator runs** the migration and every deploy (`AWS_PROFILE=ef`). Claude writes them and hands
over the commands; it does not run them.

## Automated — run before any deploy

```sh
pnpm --filter @effy/shared-types test          # words + fixtures (the Kotlin twins read the same file)
pnpm --filter @effy/edge-shared test            # judgeWindow unchanged; windows.ts any-time split; override
pnpm --filter @effy/edge-commerce test          # quote carries anyTime/asap; intent binds and refuses
pnpm --filter @effy/edge-orders test            # changeEffyWindow route; promise filter
pnpm --filter @effy/edge-fleet test             # slot flag; dispatch label
pnpm --filter @effy/customer-web test           # the picker's four choices, one highlighted
( cd apps/customer-mobile && ./gradlew :shared:allTests )
bash scripts/check-no-legacy-delivery.sh && bash scripts/check-driver-delivery-words.sh && bash scripts/check-shop-delivery-words.sh
```

Guards that must still pass untouched: `fee.guard.test.ts`, `windows.guard.test.ts`,
`coverage.guard.test.ts`, `gateway-capacity.contract.test.ts`, `change-map.guard.test.ts`.

## Setup in dev (operator, once)

1. Run the migration; deploy in the order in research R8. **That is all** — the migration creates the
   Any time window and the estimate; there is nothing to switch on.
2. Optional: Back-office → Delivery → Windows → the row badged **Any time** → Edit, to set the hours
   untimed deliveries go out and a daily limit (the walk's row 11 needs a limit of 2).

⚠ **Today and "as soon as possible".** An ASAP order lands on TODAY only while today's Any time window
is open by the one window rule: its cutoff has not passed AND a collection run can still be made that
reaches the hub before the window STARTS. The migration starts the window at the earliest existing
window's start, so in most setups ASAP lands on the next delivery day until staff give it a later start.

## Walk

| # | Do | Expect |
|---|---|---|
| 1 | Back-office → Delivery → Windows | One row is badged **Any time**; it has Edit and no "Switch off". A new window has no Any time option. |
| 2 | Open checkout at an Effy address | The days and "No particular day" are offered; nothing highlighted; Continue is disabled. |
| 3 | Tap a later day | That day alone is highlighted; "Any time during the day"; fee with no surcharge; Continue enabled. |
| 4 | Open "Need a specific time?", pick a window | Window highlighted; fee follows; day's untimed choice gone. |
| 5 | Close the time option | Back to the day alone; fee follows. |
| 6 | Tap a same-day window | Nothing under Standard highlighted. |
| 7 | Tap "No particular day" | Only it is highlighted; the estimate is shown; fee has no today surcharge. |
| 8 | Pay with a day-only choice | Order page, receipt and email say the day and "any time"; no hours anywhere. |
| 9 | Pay with "No particular day" while today's Any time window is still open (see the note above) | Customer reads "As soon as possible — usually within 2–3 days", no day. In back-office the order sits in **today's** Any-time window. |
| 10 | Same, once it has closed for today | Back-office shows it in the **next delivery day's** Any-time window. |
| 11 | Place two day-only orders for one day (capacity 2), then open checkout as a third customer | That day cannot be chosen untimed; its windows still can ("Choose a time for this day"). |
| 12 | Hold a day-only choice, fill the day from another session, then pay | Refused; told the day is no longer available; picker redrawn with nothing chosen; no charge. |
| 13 | On the day: collection run, hub check-in | The driver sees an **Any time** group with the right count; classifies nothing. |
| 14 | Dispatch → that day | An **Any time** round beside the window rounds, opening at 12:00 less the planning lead. |
| 15 | Back-office → Orders → filter "Delivered by Effy — Day only", open one, "Change day or time…", give it a window | Saved with who/why in the staff audit; the customer's order page says the window (no message is sent). |
| 16 | Move a courier order to Effy choosing the Any-time window | Succeeds under the same rules as checkout. |
| 17 | Open an order placed before 085 | Reads exactly as it did. |
| 18 | Repeat 2–8 in the customer app | Same choices, same words. |
| 19 | Shop console, any of these orders | "Effy driver" and nothing about a day or time. |
