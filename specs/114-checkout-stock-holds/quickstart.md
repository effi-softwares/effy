# Quickstart: Hold Stock at Checkout (114)

## Before the walk (operator)

1. `make db-up ENV=dev`: `20261112120000_checkout_stock_holds.sql` (additive: `stock_hold`, `housekeeping_settings.stock_hold_min`).
2. `make apply ENV=dev`: the `StockHoldLateShort` alarm.
3. `make edge-deploy ENV=dev SERVICE=commerce`: the hold at payment start, `stock_changed`, and the left-to-sell rule in
   the cart, checkout and saved items.
4. `make edge-deploy ENV=dev SERVICE=orders`: Clean-ups' hold time, the activity words, and 113's abandon releasing
   holds.
5. `make edge-deploy-all ENV=dev`: the shared library (the rule, finalize, operator stock reads) reaches `storefront`,
   `inventory`, `inventory-staff`, `catalog`, `shop` and `customer`.
6. back-office, shop-web and customer-web through their pipelines. Then a new customer app build. **The app and the
   website must be on 114 before shoppers can pay**, because `shownLines` is required.

```sh
psql "$(AWS_PROFILE=ef bash infra/scripts/db-dsn.sh dev)"
```

You need:
- two test customers (A and B), each signed in on a different surface (A on the app, B on the website), with the test
  card `4242 4242 4242 4242`;
- one shop console;
- back-office as an admin and as a manager;
- one counted product, set to **2** on the shelf.

## Local checks (Claude, before hand-off)

- Container suites on the local Postgres recipe:
  - `shared/src/stock/holds.container.test.ts`:
    - SC-001: 20 parallel payment starts for 5 units;
    - own holds excluded;
    - expiry with no sweep;
    - replace on basket change;
    - release on abandon and on fail;
    - late payment complete and short;
  - commerce checkout:
    - `stock_changed` from shown lines, and under the lock;
    - a decline keeps the holds;
    - a paid order consumes them;
  - orders housekeeping: the second field, roles, version, activity words;
  - inventory and catalog reads: `held` and `leftToSell`.
- Guards:
  - `stock/holds.guard.test.ts` (new): one writer, readers limited;
  - `availability.guard.test.ts` (no hand-written stock comparison; saved items fixed);
  - `change-map.guard`, `live.contract`, gateway capacity (unchanged, 234/300);
  - back-office tours (HK version raised).
- `pnpm --filter @effy/shared-types test` and the contract regeneration.
- back-office, shop-web and customer-web: vitest and builds.
- Customer app: host tests for the `stock_changed` handling and the words fixture; the Android and iOS compiles.
- Goose up / down / up on the local Postgres.

## The walk (dev)

### The last units go to one shopper (US1)

1. A and B both put **2** of the product in their carts.
2. A goes to the payment step (the card form is showing) and stops.
   - The shop console's product (already open) shows In stock 2, In checkouts 2, Left to sell 0, without a reload,
     within 5 seconds of A reaching the payment step (SC-005).
   - back-office's product shows the same.
3. B opens checkout. The line shows the product as out of stock, with 054's words, and B cannot pay for it.
4. A pays. A's order is not short. The shelf reads **0** and In checkouts reads **0**.

### Charged only for what was shown (US2)

5. Set the shelf to **3**. B shows checkout with 3. A puts 2 in the cart and reaches the payment step.
6. B presses Pay. B is refused with "Some items in your cart changed while you were paying. Check your order, then pay
   again." B's line now shows 1, and nothing was charged. B presses Pay and is charged for 1.

### Held stock goes back (US3)

7. A reaches the payment step for 1 unit and walks away.
   - After the hold time (15 minutes) B can buy it.
   - No clean-up ran: check `select * from stock_hold` still has A's row, with `held_until` in the past.
8. A reaches the payment step again, then declines with `4000 0000 0000 0002`. Within the hold time A pays with `4242…`
   and gets the unit.
9. A reaches the payment step and leaves. In psql, set the order's `updated_at` back 25 hours. After the next
   unpaid-orders run, the order is `abandoned` and `stock_hold` has no rows for it.

### The hold time (US5)

10. Settings › Business › Clean-ups.
    - As the manager, "Hold stock at checkout" reads 15 minutes and cannot be changed.
    - As the admin, set it to 5. The activity drawer shows the change and who made it.
    - A new payment start's `held_until` is 5 minutes ahead.
    - Set it back to 15.

### Database spot checks

```sql
-- no counted size is held beyond its shelf
select v.id, v.stock_on_hand, sum(h.quantity) held
  from stock_hold h join product_variant v on v.id = h.variant_id
 where h.held_until > now() and v.stock_tracked
 group by v.id, v.stock_on_hand having sum(h.quantity) > v.stock_on_hand;   -- expect 0 rows (unless a shop lowered a count)

-- only unpaid orders hold anything
select count(*) from stock_hold h join "order" o on o.id = h.order_id where o.status <> 'pending_payment';   -- expect 0
```

CloudWatch, namespace `Effy/Commerce`: `StockHolds`, `StockHoldsEnded`, `StockHoldLate`.
