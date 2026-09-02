# Contract: Shop Console Redesign — New/Changed Endpoints

Existing restyled screens (dashboard, order queue/detail, catalog, product detail) call **no new
endpoints** — they consume the same reads `apis/edge-api/shop` and `apis/core-api` already serve
(020, 054, 016). This contract covers only genuinely new or extended surface.

All `edge-api/shop` routes below sit behind the existing shop-pool API Gateway authorizer
(per-route, per Principle IV) and are additionally checked against the platform's own
`shop_staff`/`shop_staff_role` record — a valid claim never overrides it. "Manager-only" below
means `shop_manager` in `cognito:groups` **and** an active `shop_manager`-role record at the
acting shop; "staff-readable" means any active `shop_staff` role may read.

## Cold path — `apis/edge-api/shop`

### Suppliers

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/shop/v1/suppliers` | staff-readable | own shop only |
| `POST` | `/shop/v1/suppliers` | manager-only | |
| `GET` | `/shop/v1/suppliers/{id}` | staff-readable | 404 if not own shop (never leak existence) |
| `PATCH` | `/shop/v1/suppliers/{id}` | manager-only | |
| `DELETE` | `/shop/v1/suppliers/{id}` | manager-only | refused if referenced by a non-draft purchase order |

### Purchase orders

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/shop/v1/purchase-orders` | staff-readable | filterable by status/supplier |
| `POST` | `/shop/v1/purchase-orders` | manager-only | body: `supplierId`, `lines: [{productId, orderedQty, unitCost}]` — creates `draft` |
| `GET` | `/shop/v1/purchase-orders/{id}` | staff-readable | |
| `PATCH` | `/shop/v1/purchase-orders/{id}` | manager-only | edit lines while `draft`; submit via status transition |
| `POST` | `/shop/v1/purchase-orders/{id}/receive` | manager-only | body: `lines: [{lineId, receivedQty}]` — creates `stock_movement` rows, increments `product.stock_on_hand`, sets status per data-model's state machine |

### Team

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/shop/v1/team` | staff-readable (read-only for non-managers, FR-019b) | own shop roster |
| `POST` | `/shop/v1/team/invite` | manager-only | body: `email`, `role: shop_manager \| shop_staff` — reuses 009's provisioning mechanism (research R5) |
| `PATCH` | `/shop/v1/team/{staffId}/role` | manager-only | refused if `staffId` not at acting manager's shop (FR-019a); refused if it would leave the shop with zero managers |
| `POST` | `/shop/v1/team/{staffId}/deactivate` | manager-only | same shop-scope and last-manager refusals as above |

### Restock queue read (existing route, extended)

| Method | Path | Access | Notes |
|---|---|---|---|
| `GET` | `/shop/v1/restock` | staff-readable | existing 054 route; response now groups by `supplier` (nullable → "Unassigned" bucket per edge case) |

## Hot path — `apis/core-api` (new shop-pool verifier, one route)

| Method | Path | Access | Notes |
|---|---|---|---|
| `POST` | `/v1/orders/{orderId}/shop-refund` | manager-only, validated against the **shop** pool (new third verifier, research R2) | body: `lines: [{orderLineId, qty}]`, `reason`. Calls 055's existing refund service; writes the existing refund record with `initiated_by='shop'` and the acting `shop_staff_id`. Response and subsequent status shape are byte-identical to the existing customer/back-office refund response (FR-014a) — no shop-local field. |

## Explicitly NOT added (per spec's scope boundary, FR-012/FR-013)

- No payment-capture endpoint (capture is automatic at checkout, platform-wide).
- No carrier-selection or tracking-number field on any shipment/fulfilment write.
- No order-line edit or draft-order-duplication endpoint.
- No platform-wide (cross-shop) supplier directory endpoint.
