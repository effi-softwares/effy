# Quickstart / Walk: Shop Floor Signals (099)

## Prerequisites (operator)

1. `make db-up ENV=dev` - applies `<ts>_shop_floor_signals.sql` (five columns on `shop_sales_hour`,
   last 60 days marked for recompute).
2. Deploy, in order: `make edge-deploy SERVICE=shop ENV=dev`, then `SERVICE=fleet` and `SERVICE=driver`
   (those two only add announcements). The shop deploy must follow the migration: its Insights read
   needs the new columns.
3. shop-web deploys from `dev` as usual.
4. In back-office › Delivery, at least two active collection runs (e.g. 12:30 and 16:00).

## Automated checks

```sh
pnpm --filter @effy/edge-shared test          # dueRun moved; collection rule unit tests
(cd apis/edge-api/shop && npx vitest run)     # collection, availability, insights quality (+ container tests)
(cd apis/edge-api/fleet && npx vitest run)    # planner imports the shared dueRun; announcements
pnpm --filter @effy/shop-web test
bash scripts/check-shop-delivery-words.sh && bash scripts/check-no-refresh-timers.sh
```

## Walk (shop-web, dev)

1. **Next collection** - place two Effy orders for one shop. Today shows "Next collection · 12:30 pm ·
   Effy driver · 0 ready · 2 still picking". Mark one ready: within seconds "1 ready · 1 still
   picking", no refresh. Each order's page: "Ready by … · collected on the 12:30 pm run".
2. Have the planner assign the run to a driver (or wait for the 5-minute pass): the panel says "A
   driver is assigned". Put the driver on duty and pass the opening time: "Driver on the way".
3. The driver collects at the shop: the panel moves to the 4:00 pm run.
4. **Courier** - an order a courier collects from the shop shows the courier's time, never a run.
5. **Pick order** - an order with dry, chilled and frozen lines: three groups, Ambient first, Frozen
   last; the printed pick list matches.
6. **Availability** - Catalog › Availability: search a size, switch it off; the product page agrees and
   the storefront stops offering it. Try the last size on sale: refused with its reason.
7. **Quality** - Insights › Last 7 days shows Found rate, Can't-supply rate, Average time to ready;
   check one against a hand count.
8. Confirm no screen shows a window, a fee, a driver's name or position.
