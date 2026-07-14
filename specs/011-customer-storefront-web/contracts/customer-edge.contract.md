# Contract — `edge-api/customer` (cold path)

**Service**: `apis/edge-api/customer` → `effy-edge-customer`
**Attaches to** the Terraform-owned shared HTTP API (004 amendment A3) by `provider.httpApi.id` from
`/effy/<env>/edge/http_api_id`.
**Authorizer**: the **customer** JWT authorizer, referenced **by id** from
`/effy/<env>/edge/authorizer/customer_id`. *(It already exists — the gateway creates one per pool. This
slice is its first real client.)*
**Path scheme**: `/customer/v1/...`

Per the routing law (plan § FR-028), this service carries **profile / account management only**. Product,
catalog, search, cart, order and payment belong to the **hot path** and may never be added here.

---

## `GET /customer/v1/me`

The record-backed identity read (FR-023, FR-026). Creates the platform's customer record on first
appearance, idempotently (FR-024).

**Request**: `Authorization: Bearer <customer id token>`

**200**
```json
{
  "id": "0f7c…",
  "email": "shopper@example.com",
  "displayName": "Janith",
  "status": "active",
  "createdAt": "2026-07-14T09:00:00Z"
}
```

**Behaviour**
1. The gateway authorizer verifies the token **before any handler code runs**. A token from any other
   pool is refused there — structurally, not by our logic (SC-012).
2. The handler upserts `public.customer` on `cognito_sub` (data-model **E2**) — safe under concurrent
   first sign-ins.
3. It returns the **platform record**, not the claim set. `status` comes from the database.

**403** when `status = 'barred'` — a valid credential does **not** override the record (FR-025, SC-011).
The response body is uniform and does not disclose *why*.

⚠ **`status` is never written from token data**, and never reset by a sign-in. See the warning in
data-model E2.

---

## `PATCH /customer/v1/me`

The customer maintains the details that are theirs to change (FR-026).

**Request**
```json
{ "displayName": "Janith M" }
```

**Writable**: `displayName` **only.**

**Not writable, deliberately**: `email` (changing it is an identity operation and an account-takeover
vector — see the auth-flows contract), `status` (platform-owned), `id`, `cognito_sub`.

**200** → the updated record. **400** on validation failure. **403** if barred.

---

## Errors

Uniform problem shape, reusing `@effy/edge-shared`'s `http` helpers. `401` from the authorizer (no/invalid
token). `403` from the barred gate. `404` is never returned for `/me` — the record is created on demand.

## Notes for the implementer

- Three-layer slice per Principle VI: `functions/` (thin handler) → `service` → `repo` (raw SQL, no ORM).
- Reuse `@effy/edge-shared` (`claims`, `db`, `http`, `logger`, `validate`) — do not re-implement.
- DTOs live in `@effy/shared-types` (Principle II) and are consumed by `customer-web`, never redefined
  there.
- The customer pool carries **no `cognito:groups` claim** — do not read one, and do not add one (cookie
  size, research **D21**).
