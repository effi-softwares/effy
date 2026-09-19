# Contract — The attention evaluator

**Path**: cold path — a scheduled function in `apis/edge-api/shop` (Principle III: async batch work,
the shape 052's `receiptDrain` and 058's rollup job already use).
**Research**: R6 (why a scheduler, not triggers), R7 (coalescing), R9 (preferences)
**Data**: [data-model.md §3](../data-model.md)

---

## Why this exists as a scheduled job

⚠ **`awaiting_pick` becomes true by the passage of time.** An order ages into needing attention.
There is no INSERT, no UPDATE, no transaction to hang a trigger or a service call on. Any
event-driven design covers three of the four conditions and silently misses the most time-critical
one — so this is not a preference between architectures, it is the only one that can work.

Two rejected alternatives, recorded so they are not re-proposed:

- **Database triggers** (058's precedent). 058's `triggers.guard.test.ts` constrains every trigger
  function in `public` to `pg_notify` + an `ON CONFLICT DO NOTHING` insert, and **fails naming the
  trigger** otherwise — correctly. These predicates are joins with thresholds and ordering
  (days of cover, reorder point, refund-proposal derivation). They do not belong in a trigger, and
  the guard already says so.
- **Per-write application code.** 054's `availability`-in-14-places defect, which that slice fixed
  by moving the rule into one place and adding a guard that fails naming the file. Re-introducing
  the shape for attention would undo a lesson already paid for.

---

## ⚠ One derivation, two callers (Principle II)

`apis/edge-api/shop/src/attention/derive.ts` is **promoted out of** `today/service.ts`. Both the
Today screen and the evaluator call it.

```
derive.ts ── readToday()   (the screen — behaviour must not change)
          └─ evaluate()    (the scheduler — new)
```

**`edge-shop`'s existing Today tests must pass unmodified.** That is the proof the promotion changed
nothing, and it is the same proof 058 used for its three promotions and 056 used for the `edge-admin`
extraction.

If the screen and the evaluator ever derived attention separately, an operator would be notified
about something the console does not list, or — worse — not notified about something it does. That
is 054's defect and 058's FR-006 restated.

---

## The run

Runs on a fixed schedule, per shop, over active shops only.

```
for each active shop:
  current  := derive(shopId)                      # the same four queries the screen runs
  stored   := SELECT … FROM shop_attention_state WHERE shop_id = $1

  appeared := current \ stored                    # by (kind, subject_key)
  cleared  := stored  \ current

  DELETE stored rows in `cleared`                 # ⚠ this is what makes recurrence notify (FR-019)
  UPDATE last_seen_at on rows in both
  INSERT rows for `appeared`                      # ON CONFLICT DO NOTHING

  if appeared is non-empty:
     recipients := active staff of this shop, minus those muting each kind
     enqueue ONE notification_request per (recipient, kind) group        # ⚠ per KIND, not per item
     stamp notified_at on the inserted rows
```

### Coalescing happens here, not in the service worker (FR-020)

⚠ **A single stock count can drop forty products below their reorder point at once.** Emitting one
intent per product would be forty rows, forty sends, and forty banners — the exact behaviour that
trains an operator to dismiss everything, and the exact behaviour browsers now rate-limit (Chrome
began returning 429 to high-volume low-engagement senders in January 2026).

One intent per **kind** per run. The body carries the count: "3 products out of stock". The operator
opens the queue to see which.

⚠ This is the **opposite** of the choice made for new orders, and deliberately: each order is a
separate intent from a separate checkout transaction, and batching them would delay the first — the
one SC-001 measures. Attention arrives as a set; orders do not. Two sources, two mechanisms (R7).

### Recipients (FR-016, FR-022)

- Resolved at **enqueue time** from `shop_staff`, filtered to **active** members of that shop.
  Membership can change between occurrence and send, and the moment of sending is the one that must
  be right.
- ⚠ **`refund_proposed` goes only to `shop_manager`**, decided from the **platform record** — reusing
  Today's existing `canRefund`, never the `cognito:groups` claim and never a client-side filter. A
  proposal hidden by CSS is still sent; "the client won't show it" is not access control
  (Principle IV).
- A recipient with the kind in `muted_types` on a given registration is filtered **per registration**,
  not per person (FR-025) — one operator's tablet can be muted while their phone is not.

### Idempotency

- `dedupe_key = <type>:<sub>:<occurrenceId>`, and `notification_request.dedupe_key` is `UNIQUE`, so
  a re-run that sees the same occurrence enqueues nothing.
- ⚠ **The occurrence id, never the product or order id.** A product that goes out, is restocked, and
  goes out again is **two occurrences** and must notify twice (FR-019). Keying on the product id
  would let the very uniqueness that makes retries safe swallow the recurrence.
- The whole per-shop pass runs in **one transaction**, so a partial failure leaves neither a
  notified row without an intent nor an intent without a notified row.

### Failure

- A shop that throws is logged and **skipped**; the run continues to the next. One shop's bad data
  must not silence every other shop — this is 053's "an unconfigured FCM halted the whole drain"
  lesson.
- Repeated whole-run failure raises the one alarm this slice adds (R16).

---

## Contract tests

| # | Assertion | Proves |
|---|---|---|
| A1 | New condition → one row, one intent | The basic path |
| A2 | Run twice, condition unchanged → **one** intent total | FR-018, and the `UNIQUE` behind it |
| A3 | Condition clears → row deleted; recurs → a **second** intent | FR-019, and that the delete is what does it |
| A4 | 40 products below threshold in one run → **one** intent per recipient | FR-020 — the defect this design exists to prevent |
| A5 | `refund_proposed` with a `shop_staff` recipient → **not** enqueued for them | FR-022 |
| A6 | A muted kind → not enqueued for that registration, **still** enqueued for the operator's other one | FR-024 + FR-025 together |
| A7 | A stood-down operator → not enqueued | FR-016 |
| A8 | `awaiting_pick` (empty `subject_key`) run twice → **one** row, not two | ⚠ The `NOT NULL text` choice. With a nullable uuid, `NULL <> NULL` makes the `UNIQUE` useless and this notifies on **every run**. |
| A9 | One shop throwing → other shops still processed | 053's drain lesson |
| A10 | **`edge-shop`'s Today tests pass unmodified** | The promotion changed nothing (Principle II) |
| A11 | Container-backed: concurrent runs → no duplicate intents | The transaction actually holds |
