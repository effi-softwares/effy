# Contract — `GET /shop/v1/manager-ping` (edge-api, NEW)

**Feature**: 007 (FR-008, FR-021) · **Service**: `apis/edge-api/shop` (cold path) · **Status**: to
build this slice.

The **manager-only** proving read. Its entire purpose is to demonstrate that the shop role gate is
**backend-authoritative**: a `shop_manager` is served, and a `shop_staff` account is refused **by
the backend** even when the request is issued directly, past the hidden interface control. Twin of
`/admin/v1/admin-ping` (005), extended with the shop-scope term.

Returns **no product data**. It is a foundation demonstration, not a product capability (FR-025).

## Request

```
GET /shop/v1/manager-ping
Authorization: Bearer <shop-pool ACCESS token>
```

Behind the **shop** JWT authorizer (SSM `/effy/<env>/edge/authorizer/shop_id`).

## Authorization — decided from the platform record, not the claim

The gate is a single SQL predicate with **three terms** (see
[shop-schema.contract.md](./shop-schema.contract.md)):

```
role = 'shop_manager'   AND   staff.status = 'active'   AND   shop.is_active (⇒ shop assigned)
```

The `JOIN public.shop` makes an unassigned operator (`shop_id IS NULL`) drop out of the join, so
"no shop" and "inactive shop" are refused by the same query, with no extra branch.

**The `cognito:groups` claim is not consulted here.** A valid token carrying `shop_manager` is
refused if the platform record says disabled, unassigned, inactive-shop, or role-less. That is the
point (FR-021, SC-012, SC-005a).

## Response 200 (shop manager, active, at an active shop)

```json
{ "audience": "shop", "scope": "shop_manager", "subject": "e4a1…", "message": "pong" }
```

## Errors

| Status | When | Console renders |
|---|---|---|
| `401` | missing / expired / **other-pool** token — rejected at the authorizer | session recovery, then sign-in |
| `403` `forbidden` | authenticated, but the platform record denies: not a manager, disabled, unassigned, or inactive shop | access-denied state; telemetry `shop_manager_area_access_denied` |
| `503` `unavailable` | DB unreachable while deciding | degraded state + Retry |

The `403` body is the **uniform** access-denied problem. It **MUST NOT** disclose *which* of the
four terms failed — that would leak the platform's record state to an unauthorized caller. The
operator-facing distinction (e.g. "no shop assigned") comes from `/shop/v1/me`, which the caller
owns.

> **Fail closed**: a DB error while deciding returns `503`, never `200`. Never treat an
> authorization-check failure as a grant.

## Implementation notes

- Handler `src/functions/shop-manager-ping-v1-get.ts` → `staff/service.ts::isActiveShopManager` →
  `staff/repository.ts::authorizeShopManager` (three-layer, Principle VI).
- Mirrors `apis/edge-api/admin/src/functions/back-office-admin-ping-v1-get.ts` exactly in shape:
  `preamble` → `subject` or `401` → try authorize / catch `503` → `!allowed` → `403` → `200`.
- `serverless.yml`: function `shopManagerPingV1` → `httpApi GET /shop/v1/manager-ping`, shop
  authorizer by id; alarm `Errors > 0`.
- Log a `warn` with `subject` only on denial. **Never** log the failing term or the record.

## Tests (vitest, node)

1. Active `shop_manager` at an active shop → `200`, body shape as above.
2. `shop_staff` → `403`, uniform problem, no product data, no term disclosure.
3. Disabled `shop_manager` → `403` (SC-012).
4. `shop_manager` with `shop_id IS NULL` → `403` (SC-005a).
5. `shop_manager` at an inactive shop → `403` (SC-005a).
6. Repository throws → `503`, **not** `200` (fail closed).

Tests 3–5 assert the repository query's terms via a fake client; the live proof of 2–5 is the
operator's `curl` run in [quickstart.md](../quickstart.md) §6.
