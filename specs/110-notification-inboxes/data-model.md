# Data Model: Notification Inboxes (110)

Builds on [109's data model](../109-notification-record/data-model.md). One additive migration:
`db/migrations/20261109090000_notification_inbox.sql`.

## `public.notification` (changed)

| Change | Detail |
|---|---|
| **+ `pinned_until timestamptz`** | NULL = not pinned. Set by `notify()` from the caller (R11). CHECK `notification_pinned_important_ck`: `pinned_until IS NULL OR importance = 'important'`. |
| **type CHECK** | `notification_type_check` is replaced, adding `'driver_runs_today'` (24 types). The catalogue, the DB CHECK and the shared type list stay equal (`notification-types.contract.test.ts`). |
| **+ index `notification_unseen_idx`** | `(recipient_sub, audience) WHERE seen_at IS NULL AND archived_at IS NULL`. Used by the bell count and the badge in the push. |

Existing and reused:
- `notification_recipient_idx (recipient_sub, audience, created_at DESC) WHERE archived_at IS NULL` holds the list, the
  filters and the categories present.
- `seen_at`, `read_at`, `archived_at` and `expires_at` keep their 109 meaning, and `notification_read_seen_ck` still
  holds.

### States an item moves through (per person)

```
created ──open inbox──► seen ──tap / mark all read──► read
   │                     │                              │
   └──────────── archive ┴──────────────────────────────┘ ──► archived ──undo──► (back as it was)
any state ──expires_at passes──► not listed, not counted
important + unread + pinned_until > now ──► shown in `pinned`, above the list
```

### Rules (each tested)

| Rule | From |
|---|---|
| Listed = `archived_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, for this `recipient_sub` **and** `audience` | FR-001, FR-004, FR-005, FR-027 |
| Unseen = listed **and** `seen_at IS NULL` | FR-010 |
| Unread = listed **and** `read_at IS NULL` | FR-007 |
| Pinned = listed **and** `importance = 'important' AND read_at IS NULL AND pinned_until > now()`; never also in `items` | FR-003 |
| `seen {before}`: `seen_at = now()` where unseen and `created_at <= least(before, now())` | FR-010, FR-011 |
| `read-all {before}`: `read_at = coalesce(read_at, now())`, `seen_at = coalesce(seen_at, now())` where listed and `created_at <= least(before, now())` | FR-014 |
| `archive`: `archived_at = now()` (repeat keeps the first); undo: `archived_at = NULL`; read/seen untouched | FR-016, FR-017 |
| Another person's or audience's id: not found (404), nothing changed | FR-027, FR-028 |

## New notification type

| Type | Audience | Category | Importance | Destination | Channels | Dedupe scope | Pinned until |
|---|---|---|---|---|---|---|---|
| `driver_runs_today` | driver | work | important | `{kind:"today"}` | none (inbox only) | Effy date (`YYYY-MM-DD`) | end of that Effy day |

Words: title "You have 1 run today" or "You have N runs today"; body "Open Today to see what's first." (R12).

## Changed senders (no schema change)

| Type | Change |
|---|---|
| `order_out_for_delivery` | first sender: `driver/src/work/load.ts`, Effy orders on the loaded drops, scope = order id, push (R9) |
| `points_expiring` | channels `push` + `email` (R10) |

## Shared vocabulary (packages)

- `@effy/shared-types` `notification-inbox.ts` (new):
  - `INBOX_CATEGORIES` (category → label, filterable audiences);
  - the DTOs in [contracts/inbox-api.md](contracts/inbox-api.md);
  - `customerWebPathFor(destination)`.
- `notification-inbox.fixtures.json`: categories and their labels and icon names; Kotlin twins in both apps (R13).
- `notification-destinations.fixtures.json` gains the customer-web path for every customer case (R19).
- `LIVE_KINDS` + `"inbox"`, with the Kotlin `LiveKind` twin (R6).

## Not changed

- Retention and the purge (customers 180 days, drivers and shops 90, deliveries 30).
- `notification_delivery`, apart from the badge count read during the claim.
- Device tokens; shop per-device push choices (059).
