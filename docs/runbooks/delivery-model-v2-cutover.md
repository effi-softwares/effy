# Runbook — switching to the new delivery model (083)

From a moment the business chooses, every new order is **Delivered by Effy** (a window today or on one of
the next delivery days) or **Courier delivery**. Orders placed before that moment keep exactly what they
were sold and finish that way. This is done in **two stages, weeks apart**:

1. **Stage 1 — the switch.** Check readiness, set the moment, watch the old orders close. Reversible.
2. **Stage 2 — the removal.** Once no old order is open and every app in use is updated, the old
   checkout, settings, screens and words are removed. **Not reversible.** It is a separate release with
   its own steps; do not start it from this page.

All commands use the `ef` profile (`AWS_PROFILE=ef`).

## Before the day

Nothing detects these two; a person confirms them.

- **Every customer app in use can draw the new checkout.** The customer app build that shipped delivery
  windows (078) and the Effy/courier choice (079) must be the released build on both stores, and the
  storefront must be the current build. An older app after the moment cannot place an order: it is
  refused before anything is charged and told to try again — it does not place a wrong order — but it
  cannot buy.
- **Courier delivery is decided.** Either leave it off (an address outside Effy's area is refused at
  checkout, as today), or set it up fully in Back-office → Delivery → Coverage → Courier delivery: a
  courier fee table active (Pricing), a default courier service, and how parcels reach the courier.

## Release order (stage 1)

```sh
make db-up ENV=dev                          # 20261009122203_delivery_model_cutover — one settings column
make edge-deploy SERVICE=admin ENV=dev      # +2 staff routes (go-live, the switch) and the 5-minute sweep
make edge-deploy SERVICE=orders ENV=dev     # the order list's "still open" filter
make apply ENV=dev                          # 2 alarms + the sweep's failed-invocation alarm
```

Then the back-office build (on push). No app release and no other service is needed: the checkout, the
planner and the driver app already work both ways and decide from the one switch.

## Check readiness

Back-office → **Delivery → Go-live**.

| Item | Ready means |
|---|---|
| Delivery area | at least one postcode on Effy's list |
| Hub | the hub is set |
| Delivery fee plan | an Effy plan is active **and** prices the nearest and the farthest listed postcode |
| Delivery windows | at least one window is switched on |
| Collection runs | at least one run is active |
| Courier delivery | off, **or** a courier fee table is active and a default courier service exists |
| Drivers *(advisory)* | somebody may collect and somebody may deliver |
| Addresses outside the area *(advisory)* | says what a customer outside the area will be told |

Each line links to where it is fixed. A required line not ready **refuses the switch**; an advisory line
is a warning the business may accept (with no driver cleared, orders are taken and wait for one).

## Set the moment

Administrators only. On the Go-live tab:

- **Switch now…** — starts at once, after a confirmation.
- **Schedule** — a date and time. The field is the computer's own clock; the page shows the moment back
  in Melbourne time before and after it is saved. Read it back.
- **Change** / **Cancel the scheduled switch** — any time before the moment.

Pick a quiet moment, after the day's last same-day cutoff: an order captured the old way and paid a few
minutes later is still an old order, so a handful can appear just after the switch.

**While a switch is scheduled**, every five minutes the platform re-checks readiness. If something the
new model needs has gone (a plan deactivated, the last window disabled) and the moment is **within ten
minutes**, the scheduled switch is **cleared**, the alarm `…-delivery-model-switch-blocked` notifies, and
the History list on the page says the platform stopped it and which items were missing. Fix them and set
the moment again. A moment that has already passed is never undone automatically.

## At the moment

- The next quote any shopper asks for is the new checkout. Nothing is deployed and nothing restarts.
- The Go-live tab says **On**, when it started and who set it.
- Check one order end to end: place it in a window, see it in Orders as *Delivered by Effy*, see the
  shop's label say *Effy driver*.

## The old orders

The Go-live tab shows **how many orders sold the old way are still open**, and links to exactly those
orders (Orders → *Placed before delivery types* → *Still open*). Each finishes as it was sold:

- an old **same-day** order is delivered by an Effy driver in its window, as before;
- an old **standard** order is handed to the carrier from the hub on its day, as before;
- neither can be moved between Effy and courier (081) — it keeps how it was sold;
- cancelling and refunding work as before.

If any is still open **7 days** after the switch (`delivery_settings.legacy_orders_alert_days`), the alarm
`…-legacy-orders-open-past-due` notifies. Finish, cancel or refund each one.

## Backing out

On the Go-live tab an administrator chooses **Turn back off…** and gives a reason.

- New orders go back to being sold the old way from that moment.
- Orders placed while the new model was on are **not changed**: each keeps its window or its courier
  and is delivered that way. The planner and the driver app go on handling them.
- The reason, the person and the time are on the History list.
- Turning it on again is the same as the first time: readiness, then the moment.

Backing out is possible **only until stage 2**. After the removal there is nothing to go back to and the
tab says so.

## Stage 2 — removing the old arrangement

**Not reversible.** The migration drops columns and their data; going back means restoring a database
backup taken before it. Take that backup first.

### Before

All of these, confirmed by a person:

1. The Go-live tab says **On** and **No old order remains open**.
2. ⚠ **The customer storefront and the customer app are released WITH this, not after.** The delivery
   quote loses the fields the old checkout drew (the package list, the slot and day pickers). A customer
   web build or app build from before this release **cannot read the new quote at all** — checkout stops
   at the delivery step, before anything is charged — until that customer has the new build. Push the
   storefront build with the `commerce` deploy, and have the app release approved and ready.
   The shop and driver apps are unaffected: their fields were kept, and older builds keep working.
3. The business does not intend to turn the new model back off. After this it cannot.

The migration checks the first for itself and **refuses to run** — changing nothing — while an old order
is open, or on a database that has taken orders and was never switched over.

### Release order

The services first, then the migration: the new code reads none of the columns being dropped, the old
code reads several, so the columns must outlive the old code.

```sh
make edge-deploy SERVICE=commerce ENV=dev   # one checkout: windows or courier
make edge-deploy SERVICE=orders ENV=dev     # no "day minus lead time" due date
make edge-deploy SERVICE=fleet ENV=dev      # delivery-days settings; one row per clearance
make edge-deploy SERVICE=admin ENV=dev      # courier settings without the old estimate text
make db-up ENV=dev                          # 20261009150000_retire_delivery_model_v1
```

Only these four services changed. The driver, shop, storefront and notifications services read none of
the dropped columns and need no deploy.

⚠ **Between the `fleet` deploy and the migration, granting a driver clearance fails** (the new code no
longer writes the dropped `method` column, which is still NOT NULL until the migration). Do the two close
together, and do not edit clearances in between.

The web builds (customer storefront, back-office) go out on the same push as the `commerce` deploy, and
the customer app release with them (see "Before", 2). No `make apply`: stage 2 changes no infrastructure.

### After

- Go-live says the old arrangement was removed and when; there is nothing left to switch.
- Delivery → **Delivery days** has no "Standard delivery days" or "Carrier lead time"; the tabs read
  **Collection runs** and **Delivery windows**.
- Place an order in a window on the web and in the app. Open an order from before the switch as a
  customer and in back-office: it still shows the day or window it was sold.
- A driver and a shop on their previous app builds complete their work as before.

### If the migration refuses

| It says | Do |
|---|---|
| "N order(s) sold under the old delivery arrangement are still open" | Go-live → the old orders still open. Finish, cancel or refund each, then run it again. |
| "the new delivery model is not switched on" | Set the switch on the Go-live tab (stage 1), then run it again. On a database nobody uses, deleting its orders (`make purge-orders ENV=dev`) also clears this. |

## If something is wrong

| What you see | What it means | What to do |
|---|---|---|
| "The platform is not ready" on setting the switch | a required item went not-ready since the page loaded | the page has re-read; fix the item marked Not ready |
| "Someone else changed the switch a moment ago" | two administrators acted at once | the page now shows what they set; decide again |
| Alarm `…-background-delivery-model-switch-sweep-errors` | the five-minute check is failing | a scheduled switch will happen **whether or not the platform is ready** — cancel it until the check runs; read `/aws/lambda/effy-edge-admin-<env>-deliveryModelSwitchSweep` |
| A customer on an old app cannot check out after the moment | the app predates the new checkout | they must update; nothing was charged |
