# Contract: Promotions & Order Rules (cold path, `edge-api/admin`)

**Feature**: 027-customer-cart-sync · **Base**: shared HTTP API, `/admin/v1/...` · **Authorizer**: the
back-office pool authorizer (004 A3, referenced by id from SSM). Errors are RFC 9457 problems via
`@effy/edge-shared`.

This is the operator half of promotional codes (spec User Story 10, FR-066…FR-072) plus the one row that
holds the order rules (FR-053). It follows the **`delivery/` slice pattern** in
`apis/edge-api/admin/src/` — `types.ts` / `authz.ts` / `repository.ts` / `service.ts` /
`handler-support.ts`, one `functions/*.ts` per route — because that slice is the closest existing
analogue: operator CRUD over pricing data the hot path reads.

---

## 1. Authorization (009's A1 pattern, unchanged)

Decided from the `admin.staff` record, never from the token's groups alone:

| Operation | Gate |
|---|---|
| Read (list, detail, audit) | any **active** staff — including `csa` |
| Mutate (create, update, status, order rules) | `admin` **or** `manager`, active |

Refusals are a uniform 403 that does not disclose which term failed. Every mutation writes an
`admin.audit_log` row (actor `cognito_sub`, action, target, before/after) — that row plus
`promo_code.created_by` / `updated_by` is what satisfies FR-071.

## 2. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/v1/promotions` | List codes with definition, state and **usage count** (FR-067). Supports `q`, `status`, and keyset paging, matching the `delivery`/`shops` list conventions. |
| `POST` | `/admin/v1/promotions` | Create (FR-050). |
| `GET` | `/admin/v1/promotions/{id}` | Detail, including usage against caps and attribution (FR-071). |
| `PATCH` | `/admin/v1/promotions/{id}` | Update. **Constrained once used** — see §4. |
| `POST` | `/admin/v1/promotions/{id}/status` | Enable / disable (FR-069). |
| `DELETE` | `/admin/v1/promotions/{id}` | Delete — **only an unused code** (FR-070); otherwise 409. |
| `GET` | `/admin/v1/promotions/{id}/audit` | The `admin.audit_log` trail for this code. |
| `GET` | `/admin/v1/order-policy` | The minimum and the two ceilings. |
| `PUT` | `/admin/v1/order-policy` | Set them (FR-053). Idempotent — one row (data-model §8). |

## 3. Shapes

```ts
interface PromoCodeDTO {
  id: string
  code: string
  kind: "percentage" | "fixed"
  percentOff: number | null
  amountOff: string | null            // decimal string
  currency: string
  minimumSubtotalAmount: string
  startsAt: string | null             // ISO 8601
  endsAt: string | null
  maxRedemptions: number | null       // null = uncapped
  maxPerCustomer: number | null
  status: "active" | "disabled"
  redemptionCount: number             // counted from promo_redemption, never a stored counter
  createdBy: string
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

interface CreatePromoCodeRequest {
  code: string
  kind: "percentage" | "fixed"
  percentOff?: number
  amountOff?: string
  minimumSubtotalAmount?: string
  startsAt?: string | null
  endsAt?: string | null
  maxRedemptions?: number | null
  maxPerCustomer?: number | null
}

// Once a code has been redeemed, only these three are accepted (§4).
interface UpdatePromoCodeRequest {
  startsAt?: string | null
  endsAt?: string | null
  maxRedemptions?: number | null
  maxPerCustomer?: number | null
  // accepted ONLY while redemptionCount === 0:
  code?: string
  kind?: "percentage" | "fixed"
  percentOff?: number
  amountOff?: string
  minimumSubtotalAmount?: string
}

interface SetPromoStatusRequest { status: "active" | "disabled" }

interface OrderPolicyDTO {
  minimumSubtotalAmount: string
  currency: string
  maxLineQuantity: number
  maxDistinctItems: number
  updatedBy: string | null
  updatedAt: string
}

interface UpdateOrderPolicyRequest {
  minimumSubtotalAmount: string
  maxLineQuantity: number
  maxDistinctItems: number
}
```

## 4. The "already used" rule (FR-068)

A code with `redemptionCount > 0` may have its **window, caps and status** changed, and nothing else. A
`PATCH` that would alter `code`, `kind`, `percentOff`, `amountOff` or `minimumSubtotalAmount` on a used
code is refused with **409 `promo_immutable_once_used`**.

The reason is not squeamishness about editing: a paid order's `discount_amount` was computed from the
definition as it stood, and the receipt has to remain explainable. Changing the window or a cap changes
only what happens *next*; changing the value rewrites the meaning of history.

## 5. Validation refusals (FR-072)

| Condition | Status / `code` |
|---|---|
| `code` already exists (case-insensitively) | 409 `promo_code_duplicate` |
| `endsAt` not after `startsAt` | 422 `promo_window_invalid` |
| `kind: percentage` with `percentOff` outside 1…100 | 422 `promo_percent_invalid` |
| `kind: fixed` with `amountOff` ≤ 0 | 422 `promo_amount_invalid` |
| value field for the wrong `kind` supplied | 422 `promo_kind_mismatch` |
| a cap ≤ 0 | 422 `promo_cap_invalid` |
| `minimumSubtotalAmount` < 0 | 422 `promo_minimum_invalid` |
| `maxLineQuantity` outside 1…99, `maxDistinctItems` outside 1…500 | 422 `order_policy_invalid` |

Each has a database `CHECK` behind it (data-model §6, §8), so the service's refusal and the schema's
refusal cannot drift apart. Nothing is created on a refusal.

## 6. Console (`apps/back-office`)

A `features/promotions/` slice on the established shape — `queries.ts` / `repo.ts` / `model.ts` /
`access.ts` / `errorText.ts` plus screens — mirroring `features/delivery/`:

- **`PromotionsListScreen`** — the `DataTable` from `@effy/web-kit/console`: code, kind, value, window,
  usage against caps, status. Filter by status, search by code.
- **`PromotionDetailScreen`** — sectioned detail rows (definition · limits · usage · attribution ·
  audit trail), with enable/disable and a delete that is offered **only** when unused.
- **`OrderRulesScreen`** — the single policy row as a form: minimum spend, per-line ceiling, distinct-item
  ceiling.

**Principle V**: no card layouts and no metric cards. Usage is a **detail row** and a table column, not a
tile — the console's existing pattern, and the one the delivery screens already use. Design tokens come
from `@effy/design-system`; the 026 monochrome language is in force and no new token is introduced.

## 7. Deployment

`make edge-deploy SERVICE=admin ENV=dev` — additive routes on the existing shared gateway, so no
Terraform change and no new authorizer. **No new IAM**: the slice touches only Postgres via the existing
RDS credentials path, and never calls Cognito (unlike 009, which provisioned users).
