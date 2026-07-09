# Contract — `GET /store/v1/manager-ping` (edge-api, NEW)

**Feature**: 007 (FR-008, FR-021) · **Service**: `apis/edge-api/store` (cold path) · **Status**: to
build this slice.

The **manager-only** proving read. Its entire purpose is to demonstrate that the store role gate is
**backend-authoritative**: a `store_manager` is served, and a `store_staff` account is refused **by
the backend** even when the request is issued directly, past the hidden interface control. Twin of
`/admin/v1/admin-ping` (005), extended with the store-scope term.

Returns **no product data**. It is a foundation demonstration, not a product capability (FR-025).

## Request

```
GET /store/v1/manager-ping
Authorization: Bearer <shop-pool ACCESS token>
```

Behind the **shop** JWT authorizer (SSM `/effy/<env>/edge/authorizer/shop_id`).

## Authorization — decided from the platform record, not the claim

The gate is a single SQL predicate with **three terms** (see
[store-schema.contract.md](./store-schema.contract.md)):

```
role = 'store_manager'   AND   staff.status = 'active'   AND   store.is_active (⇒ store assigned)
```

The `JOIN public.store` makes an unassigned operator (`store_id IS NULL`) drop out of the join, so
"no store" and "inactive store" are refused by the same query, with no extra branch.

**The `cognito:groups` claim is not consulted here.** A valid token carrying `store_manager` is
refused if the platform record says disabled, unassigned, inactive-store, or role-less. That is the
point (FR-021, SC-012, SC-005a).

## Response 200 (store manager, active, at an active store)

```json
{ "audience": "store", "scope": "store_manager", "subject": "e4a1…", "message": "pong" }
```

## Errors

| Status | When | Console renders |
|---|---|---|
| `401` | missing / expired / **other-pool** token — rejected at the authorizer | session recovery, then sign-in |
| `403` `forbidden` | authenticated, but the platform record denies: not a manager, disabled, unassigned, or inactive store | access-denied state; telemetry `shop_manager_area_access_denied` |
| `503` `unavailable` | DB unreachable while deciding | degraded state + Retry |

The `403` body is the **uniform** access-denied problem. It **MUST NOT** disclose *which* of the
four terms failed — that would leak the platform's record state to an unauthorized caller. The
operator-facing distinction (e.g. "no store assigned") comes from `/store/v1/me`, which the caller
owns.

> **Fail closed**: a DB error while deciding returns `503`, never `200`. Never treat an
> authorization-check failure as a grant.

## Implementation notes

- Handler `src/functions/store-manager-ping-v1-get.ts` → `staff/service.ts::isActiveStoreManager` →
  `staff/repository.ts::authorizeStoreManager` (three-layer, Principle VI).
- Mirrors `apis/edge-api/admin/src/functions/back-office-admin-ping-v1-get.ts` exactly in shape:
  `preamble` → `subject` or `401` → try authorize / catch `503` → `!allowed` → `403` → `200`.
- `serverless.yml`: function `storeManagerPingV1` → `httpApi GET /store/v1/manager-ping`, shop
  authorizer by id; alarm `Errors > 0`.
- Log a `warn` with `subject` only on denial. **Never** log the failing term or the record.

## Tests (vitest, node)

1. Active `store_manager` at an active store → `200`, body shape as above.
2. `store_staff` → `403`, uniform problem, no product data, no term disclosure.
3. Disabled `store_manager` → `403` (SC-012).
4. `store_manager` with `store_id IS NULL` → `403` (SC-005a).
5. `store_manager` at an inactive store → `403` (SC-005a).
6. Repository throws → `503`, **not** `200` (fail closed).

Tests 3–5 assert the repository query's terms via a fake client; the live proof of 2–5 is the
operator's `curl` run in [quickstart.md](../quickstart.md) §6.
