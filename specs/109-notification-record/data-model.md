# Data Model: Notification Record & Destinations (109)

Stage A migration: `db/migrations/20261107090000_notification_record.sql`. Stage B is a later migration that drops
`public.notification_request` (research R2).

## `public.notification`: one thing a person was told

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `recipient_sub` | text NOT NULL | Cognito subject of the recipient |
| `audience` | text NOT NULL | CHECK `customer` \| `driver` \| `shop` |
| `type` | text NOT NULL | CHECK: the 23 types (same list as today, R15) |
| `category` | text NOT NULL | CHECK `orders` \| `points` \| `work` \| `stock` \| `products` \| `offers` \| `news` \| `important` \| `support` \| `announcements` (R13) |
| `importance` | text NOT NULL DEFAULT `'normal'` | CHECK `normal` \| `important` |
| `title` | text NOT NULL | Words as sent; 1–120 characters |
| `body` | text NOT NULL | Words as sent; 1–500 characters |
| `entity_id` | text NULL | What it is about (an order, consignment, run, product, fulfilment, points entry…). Used by email rendering and analytics. Never shown. |
| `destination` | jsonb NOT NULL | One value from the audience's closed list ([contracts/destinations.md](contracts/destinations.md)); CHECK `destination ? 'kind'` |
| `source` | text NOT NULL DEFAULT `'system'` | CHECK `system` \| `campaign` \| `direct`; only `system` in this feature |
| `seen_at` | timestamptz NULL | |
| `read_at` | timestamptz NULL | CHECK `read_at IS NULL OR seen_at IS NOT NULL` (reading implies seeing) |
| `archived_at` | timestamptz NULL | Not set by anything in this feature (spec 2) |
| `expires_at` | timestamptz NULL | Only `run_opens_soon` sets it in this feature (R11) |
| `dedupe_key` | text NOT NULL UNIQUE | `{type}:{sub}:{scope}`, where scope is the caller's occurrence key (R3) |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**Indexes**
- `notification_recipient_idx (recipient_sub, audience, created_at DESC) WHERE archived_at IS NULL` is for spec 2's
  list and count. It is created now, so spec 2 needs no migration.
- `notification_retention_idx (audience, created_at)` is for the purge.

**Lifecycle**: created by `notify` → `seen_at` and `read_at` set together by the read route (spec 2 adds seen-only
and archive) → deleted by the purge at the end of its retention period, or when the customer is erased.

## `public.notification_delivery`: one channel of a notification

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `notification_id` | uuid NOT NULL | FK → `notification(id)` ON DELETE CASCADE |
| `channel` | text NOT NULL | CHECK `push` \| `email` |
| `recipient_email` | text NULL | Captured when the delivery is created; CHECK `channel <> 'email' OR recipient_email IS NOT NULL` |
| `status` | text NOT NULL DEFAULT `'pending'` | CHECK `pending` \| `sent` \| `no_device` \| `muted` \| `failed` \| `expired` |
| `priority` | smallint NOT NULL DEFAULT 0 | 0 = immediate, 1 = bulk (spec 4) |
| `attempts` | int NOT NULL DEFAULT 0 | |
| `last_error` | text NULL | An error class only, never a token |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `processed_at` | timestamptz NULL | Set when the delivery reaches a final status |

**Constraints / indexes**: `UNIQUE (notification_id, channel)`;
`notification_delivery_pending_idx (priority, created_at) WHERE status = 'pending'`;
`notification_delivery_retention_idx (created_at)`.

**Status transitions**
```
pending ──sent to ≥1 device──────────────► sent
pending ──no device registered───────────► no_device
pending ──every device muted this type───► muted
pending ──notification expired───────────► expired
pending ──retryable error, attempts < max─► pending (attempts+1)
pending ──attempts reach max─────────────► failed
```
`no_device` and `muted` replace today's `skipped` + `last_error`. The meaning is the same, but it can now be counted.

## Unchanged
- `public.device_token` is unchanged. Two new deleters: `closeAccount` (all of a closing customer's rows) and the
  existing prune.
- `public.notification_request` stays until Stage B. It is drained and purged after 30 days, and nothing new writes
  to it.

## Type → category → destination (this feature)

| Type | Audience | Category | Destination | `entity_id` |
|---|---|---|---|---|
| order_paid · order_ready · order_out_for_delivery · order_delivered | customer | orders | `order{orderId}` | order id |
| order_with_courier | customer | orders | `order{orderId}` | consignment id |
| order_delivery_changed | customer | orders | `order{orderId}` | override id |
| points_credited · points_expiring | customer | points | `points` | points entry / notice id |
| run_assigned · run_opens_soon · run_changed | driver | work | `run{runId}` | run id |
| run_withdrawn | driver | work | `today` | run id |
| shop_new_order · shop_refund_proposed | shop | orders | `queue{fulfillmentId}` | fulfilment id |
| shop_awaiting_pick | shop | orders | `queue` | - |
| shop_out_of_stock · shop_low_stock | shop | stock | `product{productId}` | product id |
| shop_product_approved · _sent_back · _held · _released · _added_by_effy | shop | products | `product{productId}` | product id |
| shop_products_imported | shop | products | `catalog` | import id |

`order_out_for_delivery` stays in the catalogue and the CHECK, but nothing sends it (it is decided in spec 2).

## Retention (purge, daily)

| What | Rule |
|---|---|
| Customer notifications | `created_at < now() - 180 days` |
| Driver and shop notifications | `created_at < now() - 90 days` |
| Deliveries | `created_at < now() - 30 days` |
| Erased customers | every notification whose `recipient_sub` belongs to a customer with an uncancelled closure request past `erase_after` |
| Legacy `notification_request` | `created_at < now() - 30 days` (until Stage B) |
