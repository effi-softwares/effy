# Contract: Sending a message (112)

## `notify()` with a message (R1)

```ts
notify(tx, {
  type: "customer_message",                       // | "driver_message" | "shop_message"
  recipients: page,                               // ≤ 1,000 {sub, email}
  subject: { entityId: messageId },
  dedupeScope: messageId,                         // test: `test:${messageId}:${uuid}`
  channels: message.push ? ["push"] : [],
  expiresAt: message.endsAt,
  pinnedUntil: kind === "important" ? (message.endsAt ?? sentAt + 7 days) : null,
  message: {
    messageId,                                    // null for a test
    source: kind === "direct" ? "direct" : "campaign",
    category, importance,                         // from MESSAGE_KINDS[kind][audience]
    title, body,                                  // a test's title is prefixed "Test: "
    destination,                                  // message_audience.destination
    imageUrl,                                     // publicImageUrl(picture_key) or null
  },
});
```

- No email channel is sent (spec Assumptions; E11 is later).
- What `notify()` does with each recipient is 111's [sending rules](../../111-notification-preferences/contracts/sending-rules.md),
  unchanged:

| Kind (customer) | No yes | Push turned off | Over limits | 21:00–08:00 |
|---|---|---|---|---|
| offer, news | no row | `skipped` | `capped` | held to 08:00 |
| important, direct | n/a (required) | n/a (required) | n/a | sent now |
| driver and shop kinds | n/a (required) | n/a | n/a | sent now |

## The worker pass (R3)

```text
every minute, budget 12 min:
 1. due:      UPDATE message SET status='sending' WHERE status='scheduled' AND send_at <= now()
              … after counting: over max_recipients_per_message → status 'not_sent', event 'not_sent'
 2. pages:    FOR each message WHERE status='sending' (FOR UPDATE SKIP LOCKED):
                LOOP
                  BEGIN
                    SELECT … FROM message WHERE id=$1 FOR UPDATE   -- still 'sending'? else exit
                    rows = audienceSql(cursor_audience, filter) WHERE sub > cursor_sub ORDER BY sub LIMIT 1000
                    notify(…rows…)
                    UPDATE message_audience SET matched_count = matched_count + |rows|
                    UPDATE message SET cursor_audience, cursor_sub = last(rows).sub
                    (no rows in this audience → next audience; none left → status 'sent', sent_at, event 'sent')
                  COMMIT   -- notify's inbox announce runs after this commit
                END LOOP
 3. withdrawn: FOR messages WHERE status='withdrawn' AND withdraw_announced_at IS NULL:
                announceInbox(recipients, pages of 1,000); SET withdraw_announced_at = now()
 4. announce {scope:"ops", kind:"messages"} once if anything changed in this pass
```

**Invariants** (each has a container test):
- Stopping, or a crash, between two pages gives no duplicate and no gap: the cursor and the rows commit together, and
  the dedupe key backs it.
- Two worker passes never write the same message at once (`SKIP LOCKED`).
- Stop takes effect at the next page boundary, within one page of 1,000.
- A person matched by two filters gets one row: one statement selects `DISTINCT sub`.
- `matched_count` is never below `reached` for any audience.
- A message's people are worked out page by page at send time. Someone who joins mid-send may be included if their `sub`
  sorts after the cursor. That is acceptable, and the spec says the count is an estimate.

## Withdraw (R8)

```sql
-- inside the withdraw route's transaction, through shared withdrawMessageItems(tx, id)
UPDATE public.notification SET expires_at = now()
 WHERE message_id = $1 AND (expires_at IS NULL OR expires_at > now());
```

- The drain's existing check (`expiresAt <= now` → `expired`) stops every pending or held push.
- The inbox's existing `LISTED` rule hides the item.
