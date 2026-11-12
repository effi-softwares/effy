# Contract: Clean-ups API and changed customer routes (113)

All new routes are in the `orders` service on the **staff** gateway, behind the back-office authorizer. Roles come from
`admin.staff`. Errors are problem+json as for every staff route.

## GET /orders/v1/housekeeping

Roles: admin, manager, csa.

```json
{
  "abandonAfterMinutes": 1440,
  "mayEdit": false,
  "jobs": [
    {
      "job": "unpaid_orders",
      "lastRun": {
        "startedAt": "2026-11-12T03:15:00+11:00",
        "finishedAt": "2026-11-12T03:15:04+11:00",
        "outcome": "ok",
        "counts": { "closed": 14, "stillPaying": 1, "paidLate": 0, "unreachable": 0, "lateRefunds": 0 },
        "problem": null
      },
      "nextRunAt": "2026-11-12T03:30:00+11:00",
      "attention": null
    }
  ]
}
```

- `jobs` is always the three jobs in `HOUSEKEEPING_JOBS` order. `lastRun` is null before the first run.
- `attention`: `null`, `"failed"` (the last run failed), `"partial"` (the last run left something to retry) or `"late"`
  (no run within the job's bound: 1 hour, 2 hours or 26 hours, research R9).
- `nextRunAt` comes from the job's schedule and its last start. It is a statement of the schedule, not a promise.
- `mayEdit` is true for admins only.

## PUT /orders/v1/housekeeping/settings

Roles: admin only. A manager or CSA gets 403 `forbidden`.

```json
{ "abandonAfterMinutes": 720, "version": "2026-11-12T03:15:00.000Z" }
```

- 400 `invalid-settings` when the value is outside 60–10080, with `errors: [{ field: "abandonAfterMinutes" }]`.
- 409 `settings-changed` when `version` (the stored `updated_at`) is stale.
- 200 returns the GET body.
- It writes `housekeeping_settings_change` and announces ops `housekeeping` after the commit.

## GET /orders/v1/housekeeping/activity

Roles: admin, manager, csa. The 104 activity response (`activityResponse`) over one source:
- each run reads "Closed 14 unpaid orders" or "Erased 2 accounts · 1,200 points forfeited", with the outcome as its type;
- each setting change reads "Abandon time changed from 24 hours to 12 hours", with who changed it.

- each late-payment refund reads "Refunded {amount} paid after order {number} was closed", linking to the order page.
  The order page loads any order by id, abandoned included. Only the orders list leaves never-placed orders out.

Search, type, dates, paging and CSV work as in every drawer. Nothing names a customer.

## Changed: customer closure (customer service, shared gateway)

| Route | Change |
|---|---|
| `GET /customer/v1/closure` | `blockers` never contains an unpaid order. `kind` is `order_in_transit` only, and `resolvableByShopper` is gone. |
| `POST /customer/v1/closure` (request) | Closes the customer's unpaid orders first (research R5). 409 `payment-in-progress` with `errors: [{ field: "orderNumber", message: "<number>" }]` when one is being paid. Nothing is closed. |
| `POST /customer/v1/closure/restore` | 409 `closure-final` once `erase_after` has passed. |

Words, the same on both clients:
- `payment-in-progress`: "A payment for order {number} is going through. Try again in a few minutes."
- `closure-final`: "This account was deleted on {date} and can't be restored. You can create a new account with the same
  email."

## Changed: staff customer reads (orders service)

- The customer list and search leave out erased customers.
- The customer detail gains `closingEraseAfter` (for the "Being deleted" note) and `matchesErasedBarredOn`.
- An erased customer's order shows `customer: { name: "Deleted customer", id: null }`, so there is no link.

## Changed: customer order list (commerce)

`GET /commerce/v1/orders` returns placed orders and orders still awaiting payment, never `failed` or `abandoned` ones.
