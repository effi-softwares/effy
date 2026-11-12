# Data Model: Data Lifecycle (113)

There is one additive migration, `db/migrations/20261112090000_data_lifecycle.sql`, with a full Down. It changes no
committed migration.

## Changed tables

### `order`
- `order_status_check` widens to `pending_payment | paid | failed | canceled | abandoned`.
- No new column. "Last touched" is `updated_at` (research R2), and "placed" is `placed_at IS NOT NULL` (R4).
- New partial index `order_unpaid_idx ON order (updated_at) WHERE status = 'pending_payment'`, for the clean-up's scan.

| From | To | Writer |
|---|---|---|
| `pending_payment` | `paid` | `finalizeSucceeded` (unchanged) |
| `pending_payment` | `failed` | `finalizeFailed`, only when the provider says the intent was cancelled (R3) |
| `pending_payment` | `abandoned` | `finalizeAbandoned`, through `abandonOrder` (clean-up and closure) |
| `paid` | `canceled` | unchanged |

### `payment`
No change. A declined attempt sets `status = 'failed'` while the order stays `pending_payment`, and `abandoned` sets
`canceled`.

### `refund`
- `refund_kind_check` gains `unplaced`, and `refund_reason_check` gains `order_abandoned`.
- New `refund_unplaced_ck`: `(kind = 'unplaced') = (reason = 'order_abandoned')`, and `kind = 'unplaced'` requires
  `actor_kind = 'system'`.

### `delivery_slot_booking`, `points_hold`, `promotion_use`
No change. `abandoned` releases them with existing states (`released`, `released`, `released` / `expired`).

### `customer`
- `closure_state` CHECK becomes `open | closing | erased`.
- `email` drops NOT NULL. New `customer_erased_ck`:
  `(closure_state = 'erased') = (email IS NULL)`, and when erased, `given_name`, `family_name`, `phone` and
  `stripe_customer_id` are all NULL.
- New `erased_at timestamptz`, with `customer_erased_at_ck`: `(closure_state = 'erased') = (erased_at IS NOT NULL)`.
- New `matches_erased_barred_on date`, NULL unless the registration matched a fingerprint (FR-016).
- `customer_email_key` (UNIQUE) stays. NULLs don't collide, so an erased address registers fresh (034 FR-048).

### `customer_closure_request`
- New `erased_at timestamptz`, with CHECK `erased_at IS NULL OR cancelled_at IS NULL` (an erased request was never
  cancelled).
- New partial index `closure_due_idx ON (erase_after) WHERE cancelled_at IS NULL AND erased_at IS NULL`.
- This row is the erasure record (FR-018). Its `id` is the reference, and nothing on it identifies the person once the
  customer row is a tombstone.

## New tables

### `erased_barred_fingerprint`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `kind` | text | `email` or `phone` |
| `digest` | bytea | HMAC-SHA256 of the normalised value (R8) |
| `erased_at` | date | shown to staff on a match |

- Unique on `(kind, digest)`.
- Written only by erasure, and read only by the customer-row writer and the phone save.
- REVOKE ALL from `effy_shopper`.

### `housekeeping_run` (append-only)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `job` | text | CHECK `unpaid_orders`, `account_erasure` or `phone_registrations` (= `HOUSEKEEPING_JOBS`) |
| `started_at`, `finished_at` | timestamptz | `finished_at >= started_at` |
| `outcome` | text | CHECK `ok`, `partial` or `failed` |
| `counts` | jsonb | an object of non-negative integers (CHECK `jsonb_typeof = 'object'`) |
| `problem` | text | NULL when `ok`. An error class name or fixed words, never personal data |

- Index `(job, started_at DESC)`.
- UPDATE and DELETE are revoked from `effy_shopper` (commerce). The customer, notifications and orders services connect as
  master, so the real protection is `housekeeping.guard`: no UPDATE anywhere, and DELETE only in the purge, for runs
  older than 400 days.
- The only writer is `recordRun` (`@effy/edge-shared` `lib/housekeeping.ts`).

### `housekeeping_settings` (singleton)
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | CHECK `id = 1`, seeded |
| `abandon_after_min` | int | default 1440, CHECK 60–10080 |
| `updated_by` | text | staff email, as 111's settings |
| `updated_at` | timestamptz | |

### `housekeeping_settings_change`
The same shape as `notification_settings_change`: `field`, `old_value`, `new_value`, `changed_by` and `changed_at`. Write
access is revoked from `effy_shopper`.

## Erasure: what happens to each table (FR-010 to FR-015)

| Table | At erasure |
|---|---|
| `customer` | tombstone (above) |
| `customer_address`, `cart` (+ lines), `customer_saved_item`, `customer_list` (+ entries) | deleted |
| `feedback_submission` (+ `feedback_note`, `feedback_reply`) | deleted |
| `customer_marketing_consent`, `customer_notification_choice` | deleted |
| `points_expiry_notice`, `promotion_customer` | deleted |
| `points_account`, `points_entry` | forfeit first (`forfeit`), then kept against the tombstone |
| `points_hold` | kept (released or spent) |
| `device_token`, `notification` (+ `notification_delivery`) | deleted by the sub (109's purge is the backstop) |
| `newsletter_subscriber`, `email_delivery_status`, `email_delivery_event` | deleted by the address |
| `order_business_identity`, `receipt_dispatch` | deleted for every order of theirs |
| `order`, any status | **never deleted** (RESTRICT children: `promotion_use`, `order_promotion`, `points_entry`, `refund`, `round_stop`, `delivery_override`). Once finished or never paid: `delivery_address` and `billing_address` → `{city, region, postalCode, country}`; `delivery_note` and `delivery_handover` → NULL. Still on its way: left until finished, then scrubbed by a later run |
| `refund_request` | `message` → "Removed when the customer deleted their account." |
| `delivery_proof` | `note` → NULL; photo or signature kept |
| `courier_consignment` | `label_key` → NULL, and the label file deleted after the commit |
| `admin.audit_log` | address keys in `detail` → "Deleted customer" |
| `payment`, `refund`, `promotion_use`, `order_item`, `shop_fulfillment`, parcels and handovers | kept unchanged (no personal data) |
| `tax_document` | kept as issued (FR-014) |
| `customer_closure_request` | `erased_at` set |
| `erased_barred_fingerprint` | email and phone rows, only if `status = 'barred'` |
| Cognito user, provider customer | deleted before the transaction (R7) |

## Shared types (`@effy/shared-types`)

- New `housekeeping.ts`:
  - `HOUSEKEEPING_JOBS`: key, title, count keys and their words, schedule words and the staleness bound;
  - `HousekeepingDTO`: jobs (last run, next run, attention: `null | "failed" | "partial" | "late"`) plus
    `abandonAfterMinutes`;
  - `HousekeepingSettingsUpdate`;
  - a test held to the migration CHECK.
- `customer.ts`:
  - `ERASED_CUSTOMER_WORD`;
  - `ClosureBlockerDTO.kind` is `order_in_transit` only, and `resolvableByShopper` is removed;
  - new refusal slugs `payment_in_progress` and `closure_final`;
  - the staff customer DTO gains `closingEraseAfter: string | null` and `matchesErasedBarredOn: string | null`.
- `live.ts`: ops kind `housekeeping`.
- `refund.ts`: `RefundKind` gains `unplaced` and the reason `order_abandoned`, with their words ("Payment after the order
  closed").
- Row types that read `customer.email` become `string | null`.
- `activity-log.ts`: log `bo-housekeeping`.
