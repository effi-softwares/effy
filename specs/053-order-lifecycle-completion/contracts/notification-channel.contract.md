# Contract: Notification Channel Fan-Out

**Owner**: `apis/edge-api/notifications` (existing worker, existing schedule) · research R8

## Producer contract

An event produces **one `notification_request` row per channel it should reach**.

```
dedupe_key = "<type>:<channel>:<recipientSub>:<entityId>"
```

⚠ Rows written before this feature have **no channel segment** in their key. They are already unique and
already drained; they MUST NOT be rewritten.

| Field | `channel='push'` | `channel='email'` |
|---|---|---|
| `recipient_sub` | required — resolves to device tokens | required — identifies the person |
| `recipient_email` | NULL | **required**, snapshotted at enqueue |
| `payload` | routing only: `entityId`, `deepLink` | routing only; the template fetches what it renders |

**⚠ No PII in `payload`, on either channel** (050 FR-021). The email branch resolves what it renders at
send time from the order id; it does not carry a name or an address through the outbox.

## Consumer contract

The worker branches on `channel`:

- **`push`** — unchanged. `skipped` still means "no device token", and still is not a failure.
- **`email`** — renders the `order-delivered` template through `@effy/email-kit` and sends via SES.
  `failed` with the error recorded; retried on the next drain within the existing attempt budget.

Both branches are **idempotent by `dedupe_key`** and both leave `status`, `attempts` and `last_error`
meaning exactly what they mean today.

## Template

New `@effy/email-kit` catalogue entry **`order-delivered`**, `audiences: CUSTOMER_ONLY`.

- Pre-formatted vars only (038's rule): `orderNumber`, `deliveredOn`, `orderUrl`.
- ⚠ It states that the order arrived and links to it. **It does not restate the receipt** — that is a
  different document with a different job, already sent.
- ⚠ It carries **no package count and no shop reference** (FR-021). An email that says "your 2 parcels
  have arrived" discloses the fulfilment structure the whole product model hides.
- Must clear `make email-check`: both size budgets, the text part, the contrast passes, the
  category/unsubscribe rules.

## Scope boundary

`order_delivered` is the **only** type producing an `email` row in this feature. `order_ready` and
`order_out_for_delivery` become a values change later. ⚠ `order_paid` MUST NOT gain one — it already has
the 052 receipt, and a second email for one event is a defect, not coverage.
