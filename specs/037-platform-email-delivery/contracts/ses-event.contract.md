# Contract — the delivery-outcome event this platform consumes

**Producer**: SESv2 configuration-set event destination → SNS topic `effy-<env>-ses-events`.
**Consumer**: `apis/edge-api/admin` → `src/functions/ses-event-consumer.ts` (SNS trigger).

This is an **inbound** contract: the platform does not define the shape, it depends on a subset of it.
Only the fields listed below are relied upon; everything else is ignored on purpose, so an upstream
addition cannot break the consumer.

---

## Envelope

An SNS record whose `Sns.Message` is a **JSON string** that must be parsed. One SNS record per event;
a single Lambda invocation may carry several records, and each is processed independently — ⚠ one
malformed record must not discard the rest of the batch.

```jsonc
{
  "eventType": "Bounce",            // ← the discriminator. REQUIRED.
  "mail": {
    "messageId": "0100018f…",       // ← REQUIRED. Half the idempotency key.
    "timestamp": "2026-08-05T…Z",
    "destination": ["person@example.com"]
  },
  "bounce":    { /* when eventType == "Bounce" */ },
  "complaint": { /* when eventType == "Complaint" */ },
  "delivery":  { /* when eventType == "Delivery" */ },
  "deliveryDelay": { /* … */ },
  "reject":    { /* … */ }
}
```

## Fields relied upon, by event type

| `eventType` | Address source | Sub-type | Reason / diagnostic | Mapped state |
| --- | --- | --- | --- | --- |
| `Bounce` | `bounce.bouncedRecipients[].emailAddress` | `bounce.bounceType` (`Permanent` \| `Transient` \| `Undetermined`) + `bounce.bounceSubType` | `bouncedRecipients[].diagnosticCode` | `Permanent` → **`undeliverable`**; anything else → **`soft_failing`** |
| `Complaint` | `complaint.complainedRecipients[].emailAddress` | `complaint.complaintFeedbackType` | — | **`complained`** |
| `Delivery` | `delivery.recipients[]` | — | — | **`reachable`** |
| `DeliveryDelay` | `deliveryDelay.delayedRecipients[].emailAddress` | `deliveryDelay.delayType` | `status` | **`soft_failing`** |
| `Reject` | `mail.destination[]` | — | `reject.reason` | logged and recorded; **no state change** |

⚠ **`Undetermined` is treated as transient, not permanent.** Marking an account undeliverable on an
outcome SES itself could not classify would lock someone out on a guess. The bias is deliberately
toward under-reporting: a missed lockout is found by the person contacting support; a false lockout is
found by nobody, because the person simply leaves.

⚠ **One event can name several recipients.** Each is processed as its own record. The platform sends
one code to one address, but the contract does not guarantee that and the consumer must not assume it.

---

## Consumer rules

1. **Idempotent.** Insert into `public.email_delivery_event` with `ON CONFLICT DO NOTHING` on
   `(message_id, event_type, address)`; update `email_delivery_status` **only when a row was actually
   inserted**. SES event publishing is at-least-once, unordered and may duplicate — a redelivered
   bounce must not increment `bounce_count` twice.
2. **Out-of-order tolerant.** A `Delivery` that arrives after a `Bounce` for an *older* message must
   not resurrect the address. The status row is only advanced when the incoming `occurred_at` is **not
   older** than `last_event_at`.
3. **⚠ Never log the address, and never log `diagnosticCode`.** Both contain the recipient. Log
   `messageId`, `eventType`, `subType` and a **SHA-256 prefix** of the address. This is 035's rule
   (`logFailure` logs `err.name` only) applied to the receiving side.
4. **Unknown `eventType` is recorded and ignored, never thrown.** Throwing makes SNS retry forever and
   turns an unrecognised event into an outage of the whole consumer.
5. **Parse failures do not throw either.** A malformed message is logged with its `messageId` and
   dropped; retrying an unparseable payload cannot succeed.
6. **No filter policy on the subscription.** SES publishes the discriminator in the message *body*, not
   in message attributes, so an attribute filter would silently match nothing. Filtering happens in the
   consumer, where it is visible and testable.

---

## What is deliberately ignored

`mail.headers`, `mail.commonHeaders`, `mail.tags`, `mail.sourceArn`, `mail.sendingAccountId`,
`bounce.reportingMTA`, `bounce.feedbackId`, `complaint.userAgent`, `complaint.arrivalDate`, and
every `Open`/`Click`/`Send`/`Subscription`/`RenderingFailure` event type (not subscribed).

⚠ **`Open` and `Click` are not merely unsubscribed — they are refused.** They require a tracking pixel
and link rewriting, which on a one-time sign-in code is useless to the product and a privacy cost paid
by the recipient for nothing.

---

## Verifying this contract without a real bounce

SES's mailbox simulator produces genuine events, works regardless of account status, needs no
recipient verification, does **not** touch reputation metrics, and — critically — the simulator
address is **not** added to the suppression list, so the path can be exercised repeatedly.

| Address | Produces |
| --- | --- |
| `bounce@simulator.amazonses.com` | a hard bounce (`Permanent`) |
| `complaint@simulator.amazonses.com` | a complaint |
| `suppressionlist@simulator.amazonses.com` | a bounce as if already suppressed |
| `ooto@simulator.amazonses.com` | an out-of-office (transient) |
| `success@simulator.amazonses.com` | a delivery — ⚠ already used by 035 as the phantom-send target |

⚠ **Labelling works and is how correlation gets tested**: `bounce+case1@simulator.amazonses.com`
proves the consumer attributes an event to the right address rather than to the first one it finds.
