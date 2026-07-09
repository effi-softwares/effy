# Contract — `GET /store/v1/me` (edge-api, NEW)

**Feature**: 007 (FR-005, FR-020) · **Service**: `apis/edge-api/store` (cold path) · **Status**: to
build this slice.

The store-identity read: the console's record-backed identity read **and** the JIT touchpoint that
records/refreshes the operator in the platform's own system of record. Twin of `/admin/v1/me` (005).

Unlike `/store/v1/manager-ping` (which gates), `/me` **admits any authenticated shop-pool caller,
including role-less and store-unassigned operators** — its job is to *record* them. Privilege gating
happens on `/store/v1/manager-ping`.

## Request

```
GET /store/v1/me
Authorization: Bearer <shop-pool ACCESS token>
```

Behind the **shop** JWT authorizer, referenced by id from SSM
(`/effy/<env>/edge/authorizer/shop_id`; Terraform-owned at the shared gateway). A token minted for
any other pool never reaches the handler (Principle IV — see
[cross-pool-isolation.contract.md](./cross-pool-isolation.contract.md)).

## Behavior (records, then returns)

1. Extract `subject` from the token. Resolve email as
   `claim("email") ?? emailShaped(claim("username")) ?? null` (research R6).
2. Extract `cognito:groups`, filter to known store roles (`store_manager`, `store_staff`).
3. `staff.recordAndLoad(subject, email, roles)` — one transaction: idempotent upsert on
   `cognito_sub`, role reconcile, `last_seen_at` refresh. **A stored non-null email is never
   overwritten with null.** `status` and `store_id` are **never** written from token data.
4. Return the platform record, joined to the assigned store.

Write-on-read is a deliberate, idempotent provisioning side-effect (the operator is created in the
identity provider; the backend meets them here).

## Response 200

```json
{
  "subject": "e4a1…",
  "email": "sam@effy.test",
  "roles": ["store_manager"],
  "status": "active",
  "store": { "id": "9f2c…", "code": "CMB-01", "name": "Colombo 01", "isActive": true },
  "lastSeenAt": "2026-07-09T10:31:22.104Z"
}
```

- `roles` reflect the **platform record** (reconciled from the token this slice). Maps to
  `StoreStaffRecord` in `@effy/shared-types`.
- `status` is platform-owned.
- `store` is `null` for an operator with no assignment — an **expected** state, rendered by the
  console as a clear "no store assigned" message, never an error (FR-007).
- `email` may be `null` until the operator provisioning step supplies it (research R6).
- A **role-less** operator returns `roles: []`, `status: "active"` — recorded, admitted to nothing
  privileged.

## Errors (shared contract, `docs/api/error-envelope.md`)

| Status | When | Console renders |
|---|---|---|
| `401` | missing / expired / tampered / **other-pool** token — rejected at the authorizer, never reaches the handler | session recovery, then sign-in |
| `503` `unavailable` | DB unreachable (cold start, allowlist) | degraded state + Retry (FR-011) |

No internal detail, SQL, stack trace, or credential ever appears in a response body.

## Implementation notes

- Handler `src/functions/store-me-v1-get.ts` → `staff/service.ts` → `staff/repository.ts`
  (three-layer, Principle VI). Reuse `preamble` / `json` / `problem` / `unavailable` / `subject` /
  `claim` / `groups` from `@effy/edge-shared`. **No new dependency.**
- `serverless.yml`: function `storeMeV1` → `httpApi GET /store/v1/me`, authorizer by id
  (`${ssm:/effy/${sls:stage}/edge/authorizer/shop_id}`); alarms `Errors > 0` and `Duration p95 > 5000ms`.
- **Versioning**: born under `/v1`; adding an operation to an existing version is additive
  (`docs/api/versioning-policy.md` rule 3).
- **PII**: `email` is returned to the authenticated owner and stored, but **never logged or
  telemetried** (Principle VII). Log lines stay `subject`-only.

## Tests (vitest, node)

1. First call creates the record and returns it, `roles: []` for a group-less caller.
2. Second call refreshes `last_seen_at` with **no duplicate row**.
3. Role reconcile drops a role removed from the claim, and filters an unknown group name.
4. An unassigned operator returns `store: null` with `200`.
5. A stored email is **not** clobbered when the token carries none.
6. A repository failure returns the uniform `503` problem with the cause withheld.
