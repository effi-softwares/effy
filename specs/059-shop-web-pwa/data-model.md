# Data Model — 059 Shop Console as an Installable, Notifying Production App

**Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md) · **Spec**: [spec.md](spec.md)

One forward-only Goose migration: `db/migrations/<ts>_shop_web_push.sql`. It does four things — two
CHECK widenings, one column, one table. Nothing is dropped.

---

## 1. `public.device_token` — widened, not replaced

### 1a. ⚠ `platform` gains `'web'`

```sql
ALTER TABLE public.device_token DROP CONSTRAINT device_token_platform_check;
ALTER TABLE public.device_token ADD  CONSTRAINT device_token_platform_check
  CHECK (platform IN ('android', 'ios', 'web'));
```

**This one line is the defect fix.** Since 050 the platform has enqueued a `shop_new_order` intent
per active staff member of every fulfilling shop; the worker resolves those to `device_token` rows;
a browser could not be one. Every intent has been recorded, attempted and marked `skipped`.

⚠ **Every reader was audited before this widened** — 053 and 056 each shipped a defect through an
enum widening, and 057 records the pattern a third time. The audit is in research R5; its material
finding is that `fcm/sender.ts` **ignores `platform` entirely** and would silently send a
mobile-shaped message to a browser. That is why the sender branch (contract:
[push-payload](contracts/push-payload.contract.md)) is a correctness requirement of this migration,
not a follow-up.

**A web `fcm_token` is an FCM registration token like any other** — opaque, and already
`UNIQUE`, so a browser that re-subscribes re-points its single row exactly as a re-registering phone
does. No column changes shape.

### 1b. `muted_types` — the per-registration preference (R9, FR-024/FR-025)

```sql
ALTER TABLE public.device_token
  ADD COLUMN muted_types text[] NOT NULL DEFAULT '{}';
```

| Property | Value | Why |
|---|---|---|
| Scope | Per **registration** = per browser per device | FR-025: a manager's tablet and a picker's tablet must differ. A registration *is* "this device wants interrupting"; that is not a property of the person. |
| Shape | **Opt-out** (empty = everything on) | A type added later is **on** by default. The operator enabled notifications to be told things; a wrong default is one tap to fix, a silently-off new alert is undiscoverable. |
| Placement | A column, not a side table | 054 settled this on the same ground: the worker reads it on **every send**, and a join to learn one small set is a join added to the path that must stay cheap. |

**Not FK-constrained to a type list.** An unknown string mutes nothing, which is the safe failure —
the opposite (a constraint that rejects a preference written by a newer console against an older
database) would fail a *write* an operator made deliberately.

---

## 2. `public.notification_request.type` — four attention types

```sql
ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD  CONSTRAINT notification_request_type_check
  CHECK (type IN (
    'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
    'shop_new_order', 'run_assigned',
    'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed'
  ));
```

⚠ **Four types, not one `shop_attention`.** The operator chose to notify on all four conditions
(spec, Decisions taken), and the four behave nothing alike — two resolve within the hour, two can
stay true for days, and one is manager-only. FR-024 requires them independently switchable and
FR-022 requires one of them filtered by role; a single type makes both unrepresentable.

⚠ **Second enum widening in one migration.** The same reader audit applies, and `worker/copy.ts`'s
`COPY` map is a `Record<NotificationType, …>` — so an unhandled type is a **TypeScript compile
error**, not a runtime gap. That is the property to preserve: no `default:` branch, no
`as NotificationType`.

**`dedupe_key` semantics per type** (the column's `UNIQUE` is what makes re-delivery a no-op):

| Type | `dedupe_key` | Consequence |
|---|---|---|
| `shop_new_order` | `shop_new_order:<sub>:<fulfillmentId>` (existing, unchanged) | One per operator per portion |
| `shop_awaiting_pick` | `shop_awaiting_pick:<sub>:<occurrenceId>` | One per operator per backlog occurrence |
| `shop_out_of_stock` | `shop_out_of_stock:<sub>:<occurrenceId>` | One per operator per product going out |
| `shop_low_stock` | `shop_low_stock:<sub>:<occurrenceId>` | Same |
| `shop_refund_proposed` | `shop_refund_proposed:<sub>:<occurrenceId>` | Manager recipients only |

⚠ **The key is built from the occurrence id, never from the product or order id directly.** A
product that goes out of stock, is restocked and goes out again is **two occurrences** and must
notify twice (FR-019). Keying on the product id would make the second one a silent no-op — the
recurrence would be swallowed by the very uniqueness that makes retries safe.

---

## 3. `public.shop_attention_state` — NEW

The one genuinely new piece of state. It exists to answer a question nothing on the platform can
answer today: **when did this attention condition start?**

```sql
CREATE TABLE public.shop_attention_state (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id        uuid        NOT NULL REFERENCES public.shop(id) ON DELETE CASCADE,
    kind           text        NOT NULL CHECK (kind IN
                                 ('awaiting_pick', 'out_of_stock', 'low_stock', 'refund_proposed')),
    -- What the condition is ABOUT within its kind: a product id, an order id, or the empty string
    -- for a kind that is per-shop. Text, not uuid: the subject's type varies by kind.
    subject_key    text        NOT NULL,
    first_seen_at  timestamptz NOT NULL DEFAULT now(),
    last_seen_at   timestamptz NOT NULL DEFAULT now(),
    notified_at    timestamptz,
    CONSTRAINT shop_attention_state_uq UNIQUE (shop_id, kind, subject_key)
);

CREATE INDEX shop_attention_state_pending_idx
  ON public.shop_attention_state (shop_id) WHERE notified_at IS NULL;
```

### Why it exists at all

Attention is derived on read, in `edge-shop/src/today/service.ts`, from four independent queries.
That is correct for a screen and useless for a notification: "notify once per occurrence, again on
recurrence" (FR-018/FR-019) is unanswerable without somewhere that remembers.

### ⚠ Why a row is DELETED when the condition clears

This is the design's load-bearing decision, and it is why FR-019 needs no rule of its own.

| Event | Table action | Notification |
|---|---|---|
| Condition first observed | `INSERT … ON CONFLICT DO NOTHING` | Enqueued; `notified_at` set |
| Condition still true on the next run | `last_seen_at` bumped; nothing else | **None** — FR-018 falls out of the `UNIQUE` |
| Condition no longer observed | **Row deleted** | None |
| Condition observed again later | A **new** row, a **new** `id` | Enqueued again — FR-019 falls out of the delete |

`id` is the occurrence identity that feeds `dedupe_key` (§2). Because a recurrence is a **new row
with a new id**, the recurrence gets a key the outbox has never seen, and notifies. Keeping the row
with a `resolved_at` and comparing timestamps would have made FR-019 a rule somebody has to remember
— 027's counted-not-stored lesson pointed the same way: prefer the shape where the correct answer is
the only representable one.

### Subject keys

| Kind | `subject_key` | Reasoning |
|---|---|---|
| `awaiting_pick` | `''` (empty) | Per shop. The operator's question is "is there a backlog", not "which orders" — and the backlog changes composition constantly while remaining one situation. |
| `out_of_stock` | `product.id` | A different product running out is a different event. |
| `low_stock` | `product.id` | Same. |
| `refund_proposed` | `order.id` | A proposal is per order; an order is what a manager approves. |

⚠ **`subject_key` is `text`, deliberately, though three of four values are uuids.** The fourth is
empty, and a nullable uuid would put `NULL` in a `UNIQUE` — where `NULL` is never equal to itself,
so the `awaiting_pick` row would insert again on **every run** and notify on every run. A
`NOT NULL text` makes that failure unrepresentable.

### What it does NOT store

- **No copy, no counts, no money.** The notification text is built at send time from the same
  derivation the screen uses (Principle II). Storing a rendered string here would be a second source
  for the wording FR-006's equivalent in 058 exists to keep single.
- **No recipient.** Who is notified is resolved at enqueue time from `shop_staff` — active
  membership is authoritative and can change between occurrence and send (FR-016).
- **No `resolved_at` history.** This is operational state, not an audit trail. If attention history
  is ever wanted it is a different table with a different purpose.

---

## 4. Client-side state (not in PostgreSQL)

Recorded here because it is state, and because two entries are easy to mistake for server state.

| Store | Holds | Lifetime | Why not the server |
|---|---|---|---|
| **IndexedDB — Query cache** | The persisted TanStack Query cache | Until evicted or signed out | It **is** the server-state cache rehydrated (R8), not a second copy. ⚠ Cleared on sign-out — it holds one shop's operational data. |
| **IndexedDB — SW notification counter** | The running "N new orders" count behind the coalescing `tag` | Until the notification is opened or cleared | Only the service worker sees pushes arrive together; the producer cannot count them without delaying the first (R7). |
| **`localStorage`** | Install-prompt dismissal; last-seen app version | Per browser | A UI courtesy (FR-006 "not nagged"). Never authorization, never server data. |
| **Browser push subscription** | The FCM registration token | Until revoked, cleared, or pruned | Mirrored to `device_token`; the browser's copy is authoritative for *existence*, the table for *who it belongs to*. |

⚠ **The service worker stores no credential.** It shows a notification and opens a URL; the page
authenticates. A token in a service worker outlives the tab that put it there.

---

## Migration ordering and safety

1. All four changes are **additive**. No column is dropped, no value invalidated, no existing row
   rewritten. A `device_token` row written before this migration remains valid, with `muted_types`
   defaulting to `'{}'` — everything on, which is the pre-existing behaviour.
2. **Deploy order matters and is the reverse of the obvious one.** `db-up` **first**, then
   `edge-deploy SERVICE=shop` and `SERVICE=notifications`. A console that registers `platform='web'`
   against an un-migrated database gets a CHECK violation on every registration; the reverse order is
   merely inert.
3. ⚠ **No backfill, and that is correct.** The `skipped` notification rows accumulated since 050 are
   a **historical record of a real defect**, not a queue to replay. Re-sending them would notify
   operators about orders picked weeks ago.
4. Forward-only per constitution; the dev-only down step drops `shop_attention_state`, restores the
   two CHECKs and drops `muted_types`.
