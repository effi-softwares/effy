# Data Model: Notification Preferences & Marketing Consent (111)

There is one additive migration, `db/migrations/20261110090000_notification_preferences.sql`, with a full Down. Every
`DO $$` or function body is wrapped in `-- +goose StatementBegin` / `-- +goose StatementEnd`.

## Category policy (code, not a table)

Declared once in `packages/shared-types/src/notification-categories.ts` and pinned to
`notification-categories.fixtures.json`. The Kotlin twins are `NotificationCategoryPolicy.kt` in the customer and driver
apps.

| Audience | Category | Required | Marketing | Push default | Email default | Changeable channels | Android channel |
|---|---|---|---|---|---|---|---|
| customer | orders | no | no | on | on | push, email | `orders` |
| customer | points | no | no | on | on | push, email | `points` |
| customer | offers | no | **yes** | on after yes | n/a | push | `offers_news` |
| customer | news | no | **yes** | on after yes | n/a | push | `offers_news` |
| customer | important | **yes** | no | on | on | none | `important` |
| customer | support | **yes** | no | on | on | none | `important` |
| driver | work, announcements, important | **yes** | no | on | on | none | `work` / `announcements` / `important` |
| shop | orders, stock, products, announcements, important | **yes** | no | on | on | none | n/a (web push) |

Each entry also carries:
- `label`;
- `description`, a one-line explanation shown under the switch;
- `reason`, shown when the category is required.

(An importance per category was dropped while building: each kind of message keeps its own importance in the
catalogue, as `driver_runs_today` shows, so a category default would have been a second, unused fact.)

The inbox item is always written for a non-marketing category. For a marketing category it is written only while the
customer's current consent is yes.

## `public.customer_notification_choice`

This table holds a customer's choice where it differs from (or confirms) the default. No row means the policy default.

| Column | Type | Notes |
|---|---|---|
| customer_id | uuid NOT NULL | FK `public.customer(id)` ON DELETE CASCADE |
| category | text NOT NULL | CHECK in ('orders', 'points', 'offers', 'news') (the changeable ones only) |
| channel | text NOT NULL | CHECK in ('push', 'email') |
| enabled | boolean NOT NULL | |
| surface | text NOT NULL | CHECK in ('app', 'web') |
| changed_at | timestamptz NOT NULL DEFAULT now() | |

- PK `(customer_id, category, channel)`.
- CHECK `customer_notification_choice_channel_ck`: `category NOT IN ('offers','news') OR channel = 'push'`. This mirrors the
  policy; the policy test checks that the CHECK lists agree with the declaration.
- Written only by `preferences.ts`. Read by `notify()`, the drain claim and the two GET routes.
- Grant SELECT, INSERT, UPDATE, DELETE to `effy_shopper` (the customer service connects as it).

## `public.customer_marketing_consent` (append-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK DEFAULT gen_random_uuid() | |
| customer_id | uuid NOT NULL | FK `public.customer(id)` ON DELETE CASCADE |
| category | text NOT NULL | CHECK in ('offers', 'news') |
| granted | boolean NOT NULL | yes / no |
| surface | text NOT NULL | CHECK in ('app', 'web') |
| via | text NOT NULL | CHECK in ('prompt', 'settings', 'inbox') |
| wording_version | text NOT NULL | CHECK `char_length BETWEEN 1 AND 64`; the version shown |
| created_at | timestamptz NOT NULL DEFAULT now() | |

- Index `customer_marketing_consent_latest_idx (customer_id, category, created_at DESC)`.
- Append-only: no UPDATE or DELETE grant to `effy_shopper`. The erasure purge (`notifications` service, owner role) is the
  only deleter. `preferences.guard.test.ts` fails any UPDATE or DELETE in source except the purge.
- A "Not now" on the prompt writes two rows (offers, news), both `granted = false, via = 'prompt'`.

### View `public.marketing_consent_current`

```text
DISTINCT ON (customer_id, category) customer_id, category, granted, surface, via, wording_version, created_at
ORDER BY customer_id, category, created_at DESC
```

The one reader of "is the answer yes now" (R3). Granted SELECT to `effy_shopper`.

## `public.notification_settings` (singleton)

| Column | Type | Notes |
|---|---|---|
| id | smallint PK DEFAULT 1 | CHECK `id = 1` |
| promo_push_per_day | integer NOT NULL DEFAULT 1 | CHECK `>= 0` and `<= 20` |
| promo_push_per_week | integer NOT NULL DEFAULT 3 | CHECK `>= promo_push_per_day` and `<= 100` |
| updated_by | text NOT NULL DEFAULT 'migration' | staff sub |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

The migration inserts the single row.

### `public.notification_settings_change` (append-only)

This table follows `points_settings_change` and serves the activity log.

| Column | Type |
|---|---|
| id | uuid PK DEFAULT gen_random_uuid() |
| field | text NOT NULL |
| old_value | text NOT NULL |
| new_value | text NOT NULL |
| changed_by | text NOT NULL |
| changed_at | timestamptz NOT NULL DEFAULT now() |

## `public.notification_delivery` (109): changes

- Adds `not_before timestamptz NULL`, meaning "do not send before" (quiet hours). NULL means as soon as possible.
- `notification_delivery_status_check` gains `skipped` (by the person's choice, or consent gone at release) and `capped`
  (over the promotion limits). The full list: pending, sent, no_device, muted, failed, expired, skipped, capped.
- CHECK `notification_delivery_not_before_ck`: `not_before IS NULL OR channel = 'push'` (only pushes are held).

## State of one delivery (after this spec)

```text
                      ┌─ skipped  (choice off at write, or consent/choice gone at release)
notify() writes ──────┼─ capped   (marketing push over the limits)
                      └─ pending ─┬─ (not_before in the future: held, not claimed)
                                  └─ claimed by the drain → sent | no_device | muted | failed | expired | skipped
```

## `notification_marketing_idx` (new index)

`public.notification (recipient_sub, created_at) WHERE category IN ('offers', 'news')`, partial, so counting a customer's
promotional pushes for the limits reads only their marketing rows.

## Rules at write time (`notify()`), per recipient

1. Resolve the catalogue entry → its category policy.
2. **Marketing**: take the promo-limit advisory lock. Drop recipients whose `marketing_consent_current.granted` is not
   true. Those recipients get no notification row (FR-011). Refuse words without "Effy" (FR-022).
3. Insert the notification rows (unchanged dedupe).
4. For each requested channel, insert the delivery with:
   - status `skipped` when `channelAllowed` is false;
   - else status `capped` for a marketing push over either limit;
   - else `pending`, with `not_before` = the next 08:00 on Effy's clock when the push is marketing and now is in
     [21:00, 08:00).
5. The inbox announce runs after commit (110), unchanged.

## Erasure

The `notifications` purge deletes `customer_notification_choice` and `customer_marketing_consent` rows of customers past
their closure's `erase_after` (not cancelled), in batches, beside the existing notification erasure.
