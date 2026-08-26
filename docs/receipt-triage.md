# Triage: "I didn't get my receipt"

Feature 052. One query answers it. This exists so the question can be settled without reading a spec.

## The query

```sql
SELECT reason, status, attempts, last_error, message_id, created_at, processed_at
  FROM public.receipt_dispatch
 WHERE order_id = $1
 ORDER BY created_at DESC;
```

## Reading it

| What you see | What it means | What to do |
|---|---|---|
| **no row** | The order never reached `paid`, or it predates this feature. ⚠ There is **no backfill** by design — only orders paid after deploy enqueue automatically. | Check `public."order".status`. If it is paid and recent, the producer did not run — look at the finalize path. Older order: use the resend. |
| **`pending`, `attempts` 0, and old** | The drain is not running, or mail is not configured. The worker **fails open** — it leaves rows pending rather than burning the attempt budget on a misconfiguration. | Check the `receiptDrain` schedule fired, and that `MAIL_SENDER` resolves. Its log line is `mail not configured — skipping receipt drain`. |
| **`skipped`, `last_error = no_recipient`** | No email address on the account. A valid outcome, not a failure. | Nothing to fix in the platform. |
| **`skipped`, `last_error = order_unavailable`** | The order could not be read at send time. | Check the order still exists; it will not be retried. |
| **`failed` + `last_error`** | SES refused, `attempts` times. | Read the error. The most likely cause is the IAM grant — see below. |
| **`sent` + `message_id`** | It left the platform. | Join `message_id` to `public.email_delivery_event` (037) for the bounce/complaint outcome. A hard bounce means the address is bad, not the platform. |

## The failure that looks like a permissions success

⚠ `ses:SendEmail` authorizes against **every resource the request touches**, and 037 made every send
name a configuration set. A policy granting the **identity alone** does not tighten the grant — it
**breaks** it, at send time, with a denial that reads like a credentials problem.

Both `edge-auth` and `edge-customer` shipped exactly this. The notifications service grants both ARNs,
and a config-contract test asserts it stays that way.

## The alarm

`{env}-receipt-send-failed` fires on `Effy/Notifications` → `ReceiptSendFailed` > 3 in two 5-minute
periods, routed to the alerts SNS topic. Its threshold is deliberately lower than the push alarm's
(10): push has a legitimate baseline of stale-token failures, while a failed receipt send means SES
refused something the platform believed it could send.

## Sending it again

A customer can do this themselves from the receipt on either surface. Rate-limited to 3 per order per
hour (`RECEIPT_RESEND_WINDOW_MINUTES` / `RECEIPT_RESEND_MAX_PER_WINDOW`). A refused request **enqueues
nothing** — if you see no new row after a complaint about the button, check whether the limit was hit.

⚠ There is **no way to send a receipt to a different address**, deliberately. The recipient is resolved
from the authenticated account, and the endpoint has no field to override it: the receipt carries a
person's name, delivery address and purchase history.

## What this document is not

It is **not a tax invoice**, and the receipt says so. Two prerequisites, neither engineering work:

1. The **ABN is unsupplied** — `packages/legal-content/src/identifiers.json` holds `[ABN]`.
2. **Per-item GST treatment is unmodelled.** Basic food is GST-free in Australia, so a grocery basket
   is a *mixed supply*: "total price includes GST" is false for most Effy orders, and the ATO's
   "extent to which each sale is taxable" requirement cannot be met from data that does not exist.

⚠ Supplying the ABN alone does **not** turn receipts into tax invoices — `canIssueTaxInvoice()` stays
false until both land.
