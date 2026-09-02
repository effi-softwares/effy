# Quickstart: Shop Console Redesign

Validation scenarios for each user story in `spec.md`. Run locally before any deploy.

## Prerequisites

- `make db-up ENV=dev` applied through this feature's migration (adds `supplier`,
  `purchase_order`, `purchase_order_line`, the `product.supplier_id` and
  `stock_movement.purchase_order_line_id` columns, and the refund initiator column).
- `apis/edge-api/shop` running locally (`make edge-run SERVICE=shop` or the local Docker/dev
  pattern the service already uses) with a seeded shop that has: some orders in `Awaiting pick`,
  at least one product below its restock threshold, and at least one `shop_manager` + one
  `shop_staff` account.
- `apis/core-api` running locally with the shop-pool verifier configured (the new third pool
  entry).
- `apps/shop-web` running (`pnpm --filter shop-web dev`).

## US1 — Dashboard (P1)

1. Sign in as a shop operator.
2. Confirm the dashboard shows real (non-placeholder) counts for orders awaiting pick and orders
   ready for pickup.
3. Confirm a low-stock product and the oldest waiting order both appear in "needs attention" and
   are clickable through to their detail screens.
4. Clear all waiting orders and low-stock products in the seed data; reload; confirm a calm empty
   state renders (not a blank or zeroed layout).

## US2 — Order queue & detail (P1)

1. Open the order queue; filter to "Awaiting pick"; confirm the tab count matches the filtered
   row count.
2. Search by order id, customer name, and a SKU; confirm each narrows correctly.
3. Open an order; confirm no payment-capture button, no carrier-selection field, and no
   tracking-number field appear anywhere on the screen (FR-012).
4. Advance the order through its lifecycle; confirm the queue reflects the new status without a
   full reload.
5. Select 3+ orders; apply a bulk state-advance; confirm a success summary names how many
   succeeded.

## US3 — Catalog, product detail, stock/restock (P2)

1. Search/filter the catalog; confirm results update with accurate stock indicators.
2. Open a product; edit a field; confirm it persists and reflects in the list.
3. Open the restock queue; confirm it lists exactly the products flagged by the existing
   low-stock rule, and that a product with no supplier appears under "Unassigned" rather than
   disappearing (edge case).

## US4 — Visual consistency (P2)

1. Visit every screen at desktop width and at a tablet-width viewport (per 014's tablet-first
   floor) in both Light and Dark mode; confirm no clipped controls and no leftover prior-design
   styling.
2. Confirm the "warning" states (awaiting-pick, low-stock, medium-risk) render as monochrome
   emphasis, not a new colour (research R3) — run `make tokens-check` / the design-system AA gate
   and confirm it stays green.
3. Set Dark mode, sign out, sign back in; confirm the appearance choice persisted.

## US5 — Shop-initiated refund/cancellation (P2)

1. As a `shop_manager`, open an order and initiate a refund with a reason for one line.
2. Confirm the order's refund status advances through the same states 055's pipeline already
   defines (`submitting` → `submitted` → settled/`failed`/`refused`).
3. Open the **same** order from the back-office console (or the customer-facing order view, if
   locally reachable); confirm the refund status is identical — not a second, disagreeing record.
4. As a `shop_staff` (non-manager) account, open the same/another order; confirm refund/payment
   status is visible but no refund/cancel action is offered (FR-014b).
5. Force a refund failure (e.g. a known-bad test amount, matching however 055's own T097-style
   negative proof works) and confirm the order does not claim the money went back.

## US6 — Suppliers & purchase orders (P3)

1. Create a supplier; assign it to a product; confirm the product now groups under that supplier
   in the restock queue.
2. Build a purchase order from one or more restock lines with a quantity and unit cost per line;
   confirm the running total is correct.
3. Mark the purchase order fully received; confirm the product's stock-on-hand increases by the
   received quantities and a `stock_movement` row references the purchase order.
4. Repeat with a **partial** receive; confirm the purchase order shows `partially_received` with
   the correct outstanding quantity, not silently closed.

## US7 — Team management (P3)

1. As a `shop_manager`, invite a new team member with a role; confirm they can sign in
   (passwordless) and see only their own shop's data.
2. Change their role, then deactivate them; confirm both take effect immediately and are visible
   identically from the back-office staff view (no extra sync step).
3. Confirm the manager cannot view/invite/edit staff at a different shop (own-shop scoping,
   FR-019a) — attempt via a direct API call with a foreign `shop_id`/`staffId` and confirm refusal.
4. Attempt to deactivate the shop's last remaining manager; confirm it is refused.
5. As a `shop_staff` (non-manager), open the team screen; confirm it is read-only or hidden
   (FR-019b).

## Negative/fail-closed proofs (cross-cutting)

- Suspend the signed-in operator's shop (or deactivate the operator) mid-session; confirm the
  existing backend gate still denies access — the redesign must not have weakened it (Edge Cases).
- Attempt every "MUST NOT" from `spec.md` FR-012/FR-013 directly against the API (bypassing the
  UI) and confirm each is refused, not merely hidden in the UI.
