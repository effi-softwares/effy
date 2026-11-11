# Data Model: Back-Office Messages (112)

There is one additive migration, `db/migrations/20261111090000_backoffice_messages.sql`, with a full Down. Every
`DO $$` or function body is wrapped in `-- +goose StatementBegin` / `-- +goose StatementEnd`, and it is checked with
real goose up/down/up.

## Kinds (code, not a table)

`MESSAGE_KINDS` in `packages/shared-types/src/messages.ts` (R5) gives each kind's audiences and its category and
importance per audience. The CHECKs below list the same values, and `messages.test.ts` holds them in agreement.

## `public.message`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK DEFAULT gen_random_uuid() | |
| kind | text NOT NULL | CHECK in ('announcement', 'important', 'offer', 'news', 'direct') |
| title | text NOT NULL | CHECK `char_length BETWEEN 1 AND 60` |
| body | text NOT NULL | CHECK `char_length BETWEEN 1 AND 500` |
| picture_key | text NULL | a key under `promotions/messages-{id}/`; CHECK `picture_key LIKE 'promotions/messages-%'` |
| push | boolean NOT NULL DEFAULT true | send a phone notification besides the inbox item |
| status | text NOT NULL DEFAULT 'draft' | CHECK in ('draft', 'scheduled', 'sending', 'sent', 'stopped', 'cancelled', 'withdrawn', 'not_sent') |
| send_at | timestamptz NULL | set when scheduled or sent |
| ends_at | timestamptz NULL | CHECK `ends_at IS NULL OR send_at IS NULL OR ends_at > send_at`; becomes each notification's `expires_at` |
| sent_at | timestamptz NULL | when the last page was written |
| cursor_audience | text NULL | the audience being written (R3) |
| cursor_sub | text NULL | the last `sub` written in that audience |
| not_sent_reason | text NULL | CHECK in ('too_many_recipients'); set only with status `not_sent` |
| withdrawn_at | timestamptz NULL | |
| withdraw_announced_at | timestamptz NULL | when open inboxes were told (R8) |
| duplicated_from | uuid NULL | FK `message(id)` |
| version | integer NOT NULL DEFAULT 1 | optimistic edit (R7) |
| created_by | text NOT NULL | staff sub |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

Constraints:
- `message_direct_ck`: a `direct` message has exactly one `message_audience` row, and its filter holds exactly one
  person. This is enforced in the service and covered by a container test. The table CHECK covers what it can:
  `kind <> 'direct' OR push` (a direct message always notifies the phone).
- `message_status_fields_ck`: `(status = 'scheduled') <= (send_at IS NOT NULL)`, `(status = 'withdrawn') =
  (withdrawn_at IS NOT NULL)`, and `(status = 'not_sent') = (not_sent_reason IS NOT NULL)`.

Indexes:
- `message_list_idx (created_at DESC, id DESC)`;
- `message_due_idx (send_at) WHERE status = 'scheduled'`;
- `message_sending_idx (id) WHERE status = 'sending'`.

## `public.message_audience`

There is one row per audience the message is for.

| Column | Type | Notes |
|---|---|---|
| message_id | uuid NOT NULL | FK `message(id)` ON DELETE CASCADE |
| audience | text NOT NULL | CHECK in ('customer', 'driver', 'shop') |
| filter | jsonb NOT NULL DEFAULT '{}' | the closed shape of R4; `{}` means everyone in that audience |
| destination | jsonb NOT NULL | 109's destination JSON; CHECK `jsonb_typeof = 'object' AND destination ? 'kind'` |
| matched_count | integer NOT NULL DEFAULT 0 | people matched while sending (R15) |
| report | jsonb NULL | the frozen report (R15) |
| report_frozen_at | timestamptz NULL | |

- PK `(message_id, audience)`.
- CHECK `message_audience_kind_ck` cannot see `message.kind`. The service checks it against `MESSAGE_KINDS`, and a
  container test covers every refused pair.

## `public.message_event` (append-only)

This is the activity log (104).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK DEFAULT gen_random_uuid() | |
| message_id | uuid NOT NULL | FK `message(id)` ON DELETE CASCADE |
| event | text NOT NULL | CHECK in ('created', 'duplicated', 'edited', 'test_sent', 'scheduled', 'sending', 'sent', 'stopped', 'cancelled', 'withdrawn', 'not_sent') |
| detail | jsonb NOT NULL DEFAULT '{}' | e.g. `{ "count": 1204 }`, `{ "to": "driver" }`, `{ "from": "<id>" }`; never a person's name or email |
| actor | text NOT NULL | a staff sub, or `'system'` for the worker |
| created_at | timestamptz NOT NULL DEFAULT now() | |

- Index `message_event_idx (message_id, created_at DESC)`.
- `messages.guard.test.ts` fails any `UPDATE` or `DELETE` of `message_event`.

## `public.notification` (109): changes

- Adds `message_id uuid NULL` (FK `message(id)`, no cascade, because messages are never deleted) and `image_url text NULL`
  (CHECK `image_url IS NULL OR source <> 'system'`, so only messages and their tests carry a picture).
- `notification_type_check` gains `customer_message`, `driver_message` and `shop_message`.
- CHECK `notification_message_type_ck`: `(type LIKE '%\_message') = (source <> 'system')`. A message type is never a
  system notification, and a system type is never a campaign or direct one.
- New partial index `notification_message_idx (message_id) WHERE message_id IS NOT NULL` (the report and R16).

## `public.notification_settings` (111): changes

- Adds `max_recipients_per_message integer NOT NULL DEFAULT 20000`, with CHECK `BETWEEN 1 AND 200000`.
- Changes are logged in the existing `notification_settings_change` (field `max_recipients_per_message`).

## Grants

- The admin service connects as the owner role, like promotions. The `notifications` worker does too.
- `effy_shopper` gets nothing new. Customers read their notifications through the existing inbox reads, which select
  `image_url`.

## Lifecycle of one message

```text
draft ─send now─▶ sending ─pages─▶ sent
  │                 │ ├─stop───▶ stopped
  │                 │ └─withdraw▶ withdrawn
  ├─schedule─▶ scheduled ─due─▶ sending      (or not_sent: too many people)
  │              └─cancel─▶ cancelled
sent / stopped ─withdraw─▶ withdrawn
```

## One recipient's path

```text
worker page ──notify(type=<audience>_message, message={…})──▶ notification (message_id, image_url, source)
   └─ 111 rules: no row (no yes) │ push skipped │ capped │ held to 08:00 │ pending → drain → sent | no_device | …
withdraw ──▶ notification.expires_at = now()  ──▶ inbox hides it; drain marks pending pushes expired
```

## Erasure and retention

- The recipients' notifications follow 109's purge (180 days for customers, 90 days for drivers and shops; deliveries
  30 days).
- Before deleting, the purge freezes the report of every message sent 29 or more days ago (R15).
- A customer's erasure deletes their notifications as today. A message's `people` filter may still hold a closed
  customer's id. The purge removes erased customers' ids from `message_audience.filter->'people'` in the same batch
  (erasure must reach every copy of the person).
