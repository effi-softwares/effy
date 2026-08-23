# Contract: Notification Request (producer → outbox → worker)

The internal contract between **producers** (who know the recipient) and the **notifications worker**
(who resolves tokens and sends). Backend-only; not exposed over HTTP. Table:
`public.notification_request` (see data-model.md). SNS-ready (research R6): swapping the transport later
changes neither the fields below nor the recipient logic.

## Producer obligation (append intent)

In the **same transaction** as the state change, `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING`:

```
recipient_sub  = <the subject to notify>
audience       = 'customer' | 'shop' | 'driver'
type           = one of the six starter types
payload        = { "entityId": "...", "deepLink": "...", ...non-PII }
dedupe_key     = "<type>:<recipient_sub>:<entityId>"   -- idempotency (FR-016)
```

| Producer (path) | Trigger | type | recipient |
|---|---|---|---|
| core-api (hot, Go) | order → `paid` | `order_paid` | order's customer |
| edge-shop (cold) | `shop_fulfillment` created | `shop_new_order` | that shop's active staff (one row per staff `sub`) |
| edge-shop (cold) | fulfillment → `ready_for_pickup` | `order_ready` | customer |
| edge-driver (cold) | run assigned | `run_assigned` | the driver |
| edge-driver (cold) | delivery → out for delivery | `order_out_for_delivery` | customer |
| edge-driver (cold) | delivery → delivered | `order_delivered` | customer |

- A fan-out to N recipients (e.g. shop staff) = N rows, each with a recipient-scoped `dedupe_key`.
- **Never** put PII in `payload` (FR-021).

## Worker obligation (drain + send)

1. Claim: `SELECT ... WHERE status='pending' ORDER BY created_at LIMIT n FOR UPDATE SKIP LOCKED`.
2. Resolve tokens: `device_token WHERE subject_sub = recipient_sub AND audience = audience`.
   - none → `status='skipped'` (FR-019, **not** a failure).
3. Send via FCM ([fcm-payload.contract.md](fcm-payload.contract.md)).
   - ≥1 accepted → `status='sent'`.
   - each `registration-token-not-registered` → **delete that `device_token`** (FR-018).
   - transient/quota (429/5xx) → leave `pending`, `attempts++`; after cap → `failed` (+ alert metric).
4. Idempotent (FR-016): a re-run over `sent`/`skipped` rows does nothing; the unique `dedupe_key` stops
   duplicate enqueue at the source.

## Metrics (Principle VII)

`notification_send_succeeded{type,audience}`, `notification_send_failed{type,audience}`,
`notification_skipped_no_token`, `device_token_pruned`. Alert on sustained `_failed` rate.
