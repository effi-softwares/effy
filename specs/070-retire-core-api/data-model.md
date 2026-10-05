# Data Model: Retire the Hot Path

**No table is added, no column is added, and no business data moves.** Both backends already share
one database; the relocated code reads and writes the same rows with the same statements. Two
forward-only migrations change supporting objects only.

## Migration A — shopper database role (runs before the new services deploy)

| Object | Change |
|---|---|
| Role `effy_shopper` | Created, **without a password and unable to log in**, with a connection limit of 40 |
| Grants | Read and write on the tables the two new services use, in `public` only; use of their sequences; default privileges so tables added by later migrations are covered |
| `admin` schema | **No access.** Staff gates run in `orders` and `shop`, which keep the existing role |

The password is set afterwards by an operator-run make target that generates it, stores it in a
secret, and enables login. Nothing secret is in the migration or in Terraform state.

Down: drop the role and its grants.

## Migration B — remove the stream's notification (runs at teardown)

| Object | Change |
|---|---|
| `shop_ops_portion_changed()` and the other trigger functions that call it | Re-created without the call to `shop_ops_poke` |
| `shop_ops_poke(uuid)` | Dropped |
| `shop_ops_mark_dirty(uuid, timestamptz)` and every trigger | **Unchanged** — still marks insights buckets for recomputation |

The complete list of functions that call `shop_ops_poke` is read from
`20260914165403_shop_insights.sql` and `20260915171139_insights_mark_on_order_item.sql` when the
migration is written. `apis/edge-api/shop/src/db/triggers.container.test.ts` is updated to assert
that a change still marks its bucket and no longer notifies.

Down: restore the function and the calls.

## Existing records the relocated code depends on

Listed so each has an owner in the new layout. Shapes are unchanged.

| Record | Written by | Read by | Invariant the port must keep |
|---|---|---|---|
| `product`, `product_media`, `category`, attribute tables | (other services) | storefront, commerce | "Purchasable" has one definition |
| `promo_code`, `promo_redemption` | commerce (redemption, in the payment transaction) | storefront, commerce | Exhaustion counted from redemptions |
| `order_policy` | (admin) | commerce | Defaults 99 per line, 100 distinct when unset |
| `delivery_zone*`, `locality`, delivery plan and slot tables, `delivery_slot_load` (view) | (admin, fleet) | storefront, commerce | A hold counts only while unexpired |
| `customer_saved_item`, `customer_list`, `customer_list_entry` | commerce | commerce | A saved row exists iff at least one entry exists; writes serialised per customer |
| `cart`, `cart_item`, `cart_saved_item`, `cart_change_log` | commerce | commerce | Log the change id, mutate, bump the revision — one transaction |
| `order`, `order_item`, `order_package_delivery`, `payment` | commerce | commerce, orders, shop, driver | `pending_payment → paid` happens once |
| `delivery_slot_booking` | commerce | commerce, fleet | `held → confirmed` (optionally over capacity) or `released`; slot row locked first |
| `shop_fulfillment`, `fulfillment_item`, `fulfillment_event` | commerce (create, withdraw), shop | all | Portions created only inside the payment transaction |
| `stock_movement`, `product.stock_on_hand` | commerce, inventory | inventory, storefront | Append-only; never below zero; rows locked in id order |
| `stripe_event` | commerce | commerce | **Now inserted inside the transaction that handles the event** |
| `refund`, `refund_line`, `refund_request` | payments module (called from commerce, orders, shop) | orders, commerce | Append-only apart from status, provider id, failure reason, settled time; ceiling checked under a lock on the payment |
| `notification_request`, `receipt_dispatch` | commerce | notifications | Deduplicated by key |
| `event_outbox` | commerce | nobody (known gap, deferred) | Written in the payment transaction |
| `customer` | (customer service) | commerce | Barred or closing shoppers refused |
| `admin.staff`, `staff_role` | (admin) | orders | Authority decided from the record |
| `shop_staff`, `shop_staff_role`, `shop` | (admin) | shop | Manager, active shop, shop has a portion of the order |

## State transitions (unchanged; restated for test design)

**Order**: `pending_payment → paid` (payment transaction) · `paid → canceled` (cancellation) ·
`pending_payment → canceled`.

**Window booking**: `held` (at intent, with an expiry) → `confirmed` (payment transaction;
`over_capacity` set if the hold had lapsed and the window is full) · `held | confirmed → released`
(cancellation). A new intent for the same order deletes its previous hold first.

**Refund**: `submitting` (recorded under lock, before the provider is called) → `submitted`
(provider accepted) → `succeeded | failed` (provider notification) · `submitting → refused`
(provider rejected). **New**: `submitting` older than two minutes is resolved by the reconciler to
`submitted` or `refused`.

**Refund request**: `open → refunded | declined`; at most one open per order.
