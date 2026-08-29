# Contract: Back-Office Orders (`/orders/v1/*`)

**Service**: `apis/edge-api/orders` (new cold-path service, research R7)
**Gateway**: the shared HTTP API, `provider.httpApi.id` from `/effy/<env>/edge/http_api_id`
**Authorizer**: the **admin** pool's JWT authorizer, referenced **by id** from
`/effy/<env>/edge/authorizer/admin` — a new attachment to an existing authorizer, not a new pool.

**Authorization**, decided from the `admin.staff` record and never from the token claim
(constitution Principle IV):

| Capability | Gate |
|---|---|
| Find / read an order, read its history | any **active** staff, **including `csa`** |
| Record a handover · record an arrival | active **AND** role ∈ {`admin`, `manager`} — FR-015 |

Both gates come from `@effy/edge-shared` (promoted from `admin/src/feedback/authz.ts`, research R7).
Fail-closed: a gate that throws yields 503, never an implicit allow. A refusal states *that* it was
refused, never which term failed.

---

## `GET /orders/v1/orders`

List / search. Query: `q` (order reference or customer email), `status`, `awaiting` (`handover` |
`arrival`), `cursor`, `limit`.

`awaiting` is the join described in research R3 — the operator's work queue, derived, not stored.

**200** — `{ items: OrderSummaryDTO[], nextCursor: string | null }`, newest first.

## `GET /orders/v1/orders/{orderId}`

**200** — `OrderDetailDTO`. **404** — unknown order. ⚠ There is no ownership scoping here: staff read
every order. That is the difference between this and the customer's own `GET /v1/orders/{id}`.

## `POST /orders/v1/fulfillments/{fulfillmentId}/handoff`

Body: `{ reference?: string, carrierName?: string, note?: string, changeId: string }`

- **201** — recorded. **200** — already recorded; returns the existing record unchanged (FR-005 shape).
- **409** — the package is not `collected`, so there is nothing to hand over.
- **422** — the package is same-day and does not take a carrier handoff.
- ⚠ `reference` absent is **valid and complete** (FR-003). It is not a 422 and must not be surfaced as
  an incomplete record anywhere downstream.

## `POST /orders/v1/fulfillments/{fulfillmentId}/arrival`

Body: `{ arrivedAt?: string, note?: string, changeId: string }`

- **201** — arrival recorded; `package_arrival.source = 'staff_recorded'`.
- **200** — already arrived; the original `arrivedAt` is returned **unchanged** (FR-005).
- **409** — no `carrier_handoff` exists for this package. The body names the missing handover (FR-006).
- Writes, in ONE transaction: the status-guarded `collected → delivered`, the `package_arrival` row, and
  — only if this was the order's **last** package — the customer notification intents (push + email).

---

## DTOs → `@effy/shared-types` (Principle II)

`OrderSummaryDTO`, `OrderDetailDTO`, `OrderPackageDTO`, `CarrierHandoffDTO`, `PackageArrivalDTO`,
`OrderHistoryEntryDTO`. The console is typed **from** these, never against hand-written shapes.

⚠ **These are back-office DTOs and carry shop identity** — which is exactly why they are separate types
from the customer's. The customer's order DTO in `core-api` is unchanged by this feature and must stay
that way; FR-021 is a property of *that* contract, and the safest way to keep it is that these two type
families never meet.

---

## Money

Every amount crosses as a **2-dp decimal string**, per 027 R13. No floats, no cents integers on the wire.

---

## What this contract deliberately does not expose

No refund, no cancellation, no return, no edit of any order field, no re-send of the receipt. A route
that does not exist cannot be called by a console that grows a button for it later without a spec.
