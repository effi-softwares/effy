# Contract — `/admin/v1/deliverability/*` (back-office)

**Service**: `apis/edge-api/admin` · **Audience**: back-office pool · **Authorizer**:
`${ssm:/effy/<env>/edge/authorizer/back-office_id}` on the shared HTTP API.

Three routes. Layering and error shape follow `src/shops/` exactly: thin handler → `service.ts` →
`repository.ts` (raw SQL), refusals as `application/problem+json` via `@effy/edge-shared`.

---

## Authorization

Decided **from the platform record, never from the token claim** (Principle IV):

| Level | Rule | Routes |
| --- | --- | --- |
| read | `admin.staff.status = 'active'` — any active staff, including `csa` | `GET` × 2 |
| mutate | active **and** role ∈ (`admin`, `manager`) | `POST .../repair` |

Reuses `isActiveStaff` / the `canManage…` shape from `src/shops/authz.ts`. Fail-closed: a DB error on
the gate returns **503**, never a pass. A refusal is uniform and never says which term failed.

---

## `GET /admin/v1/deliverability`

Addresses the platform currently cannot reach. **Defaults to problems only** — a list of every
address ever delivered to would answer no question anyone has.

**Query**: `state` (`undeliverable` | `complained` | `soft_failing` | `all`, default: everything except
`reachable`) · `q` (address substring, case-insensitive) · `limit` (≤ 100, default 25) · `offset`.

```jsonc
{
  "items": [{
    "address": "person@example.com",
    "state": "undeliverable",
    "reason": "Permanent/General",
    "lastEventAt": "2026-08-05T09:14:22Z",
    "bounceCount": 2,
    "complaintCount": 0,
    "repairedAt": null,
    "subject": {                    // ⚠ null when no platform record owns this address
      "kind": "customer",           // "customer" | "shop_staff" | "admin_staff"
      "id": "0f9…",
      "name": "Sam Okafor"
    }
  }],
  "total": 1
}
```

⚠ **`subject` is nullable and that is the honest answer, not a bug.** An address may bounce before its
account exists, after it is deleted, or for the **driver** audience, which has a Cognito pool and
**no platform table at all**. Rendering "—" there is correct; inventing an owner is not.

⚠ **`diagnostic` is NOT in the list response.** It is the receiving server's raw text, it contains the
address, and it belongs on the detail view where an operator has asked for it.

---

## `GET /admin/v1/deliverability/{address}`

`{address}` is URL-encoded. Matched case-insensitively (`citext`), so the operator does not have to
reproduce the exact case — ⚠ which is precisely why the **repair** uses the stored `raw_address` and
not this path parameter.

```jsonc
{
  "address": "person@example.com",
  "state": "undeliverable",
  "reason": "Permanent/General",
  "diagnostic": "smtp;550 5.1.1 user unknown",
  "lastEventAt": "…", "lastMessageId": "0100018f…",
  "bounceCount": 2, "complaintCount": 0,
  "repairedAt": null, "repairedBy": null,
  "subject": { … } | null,
  "suppressedInSes": true,          // ⚠ read live from SES, see below
  "events": [{ "eventType": "bounce", "subType": "Permanent/General",
               "messageId": "0100018f…", "occurredAt": "…" }]
}
```

⚠ **`suppressedInSes` is read live on every request, never stored.** Two sources of truth for one fact
disagree eventually, and the moment they do the operator cannot tell which is lying — the same
reasoning that made 027 count redemptions instead of storing a counter. If the SES call fails, the
field is `null` and the console says "couldn't check", which is honest; it never defaults to `false`,
because that would read as "not suppressed".

---

## `POST /admin/v1/deliverability/{address}/repair`

The audited three-part repair (FR-034). **Requires `admin` or `manager`.**

**Body**: `{ "note": "spoke to Sam; mailbox restored 2026-08-05" }` — required, non-empty, ≤ 500 chars.
⚠ Required on purpose: a repair with no stated reason is indistinguishable from a mistake six months
later, and this action re-enables mail to an address that previously hard-failed.

**Effect, in this order:**

1. `DeleteSuppressedDestination` using the stored **`raw_address`** — ⚠ **not** the path parameter and
   **not** a lowercased form. The suppression API is case-sensitive; a normalising delete silently
   fails to remove an entry that demonstrably exists, and the operator believes they fixed something
   they did not (FR-035).
2. In **one transaction**: set `state = 'reachable'`, stamp `repaired_at`/`repaired_by`, and insert
   `admin.audit_log` (`action = "email_delivery.repair"`, `target_type = "email_address"`,
   `detail = { address, previousState, note }`) — the audit row written **inside the same transaction
   as the change it records**, per `src/shops/repository.ts`.

⚠ **SES first, database second.** If SES fails, the transaction never opens and nothing is recorded,
which leaves a true state. The reverse order could commit "repaired" while the address is still
blocked — the worst outcome available, because it *looks* fixed.

⚠ **`ResourceNotFoundException` from SES is a success, not a failure.** It means the address was never
suppressed (or already cleared), and the platform's own half still needs clearing. Treating it as an
error would make the common case — a `soft_failing` address with no SES entry — unrepairable.

**Responses**: `200` the updated detail · `400` missing/oversized note · `401` · `403` · `404` no
record for that address · `503` SES or database unavailable.

---

## Refusals

`application/problem+json` throughout, using the existing `ProblemType` map. ⚠ **No refusal echoes the
address back in `detail`** — problem responses are logged by intermediaries, and 035's
"never put a recipient in CloudWatch" rule does not stop at the service boundary.

---

## Not in this contract

- **No route to *add* a suppression.** Nothing in the product needs to make a person unreachable by
  hand, and a button that can silently disable someone's only credential is a weapon, not a feature.
- **No bulk repair.** Each repair asserts a human checked one case; a bulk action asserts nothing.
- **No customer-facing route.** The customer's own state rides the existing `GET /customer/v1/me`
  (see [data-model.md](../data-model.md)); a standalone lookup would be an account-enumeration oracle.
