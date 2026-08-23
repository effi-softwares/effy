# Data Model: Observability & Push Foundation (Phase 1)

Two new `public` tables (Goose, forward-only). No change to existing tables. Client-side telemetry state
(consent) and provider-owned data (analytics events, crash reports) live outside Postgres and are
described here only as contracts.

Migration: `db/migrations/<timestamp>_observability_push.sql`.

---

## `public.device_token`

One push-delivery address for one app install on one device. Owned by the authenticated subject.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `subject_sub` | `text` NOT NULL | the auth `sub` (token owner). No FK — spans four pools; snapshot like other subject refs. |
| `audience` | `text` NOT NULL | `CHECK (audience IN ('customer','shop','driver'))` |
| `platform` | `text` NOT NULL | `CHECK (platform IN ('android','ios'))` |
| `fcm_token` | `text` NOT NULL | the opaque FCM registration token |
| `app_version` | `text` NULL | for triage; non-PII |
| `created_at` | `timestamptz` NOT NULL | `now()` |
| `last_seen_at` | `timestamptz` NOT NULL | bumped on re-register (rotation / app open) |

**Keys / indexes**:
- `UNIQUE (fcm_token)` — a token belongs to exactly one row; re-register **upserts** (updates
  `subject_sub`, `last_seen_at`) so a device handed to another signed-in user re-points cleanly.
- `INDEX (subject_sub, audience)` — fan-out look-up "all active tokens for this recipient".

**Lifecycle / rules**:
- **Register** (FR-012): upsert on `fcm_token`; rotation replaces the value, never duplicates (SC-009).
- **Unregister / sign-out** (FR-020): `DELETE` the caller's token(s); on shared devices the app calls
  DELETE at sign-out so the next user does not inherit delivery.
- **Prune** (FR-018): the worker deletes any token FCM reports `registration-token-not-registered`.
- **No PII** (FR-021/022): only `sub`, enums, opaque token, version.

## `public.notification_request` (transactional outbox)

A recorded intent to notify a recipient, appended by a producer in the same transaction as the fact it
announces; drained by the notifications worker. (SNS-ready — see research R6.)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `recipient_sub` | `text` NOT NULL | who to notify (a subject; the worker resolves tokens) |
| `audience` | `text` NOT NULL | `CHECK (audience IN ('customer','shop','driver'))` |
| `type` | `text` NOT NULL | `CHECK (type IN ('order_paid','order_ready','order_out_for_delivery','order_delivered','shop_new_order','run_assigned'))` |
| `payload` | `jsonb` NOT NULL | minimal non-PII routing/render data (e.g. `{"orderId":"…","deepLink":"…"}`) |
| `dedupe_key` | `text` NOT NULL | `UNIQUE` — idempotency: `type:recipient_sub:entityId` |
| `status` | `text` NOT NULL | `CHECK (status IN ('pending','sent','failed','skipped'))` default `pending` |
| `attempts` | `int` NOT NULL | default 0; worker increments; capped then `failed` |
| `created_at` | `timestamptz` NOT NULL | `now()` |
| `processed_at` | `timestamptz` NULL | set when terminal |
| `last_error` | `text` NULL | non-PII error class for triage |

**Keys / indexes**:
- `UNIQUE (dedupe_key)` — a re-delivered/retried producer event never enqueues twice (FR-016). An
  insert conflict is a no-op (`ON CONFLICT DO NOTHING`).
- `INDEX (status, created_at)` — the worker's drain query (`WHERE status='pending' ORDER BY created_at
  LIMIT n FOR UPDATE SKIP LOCKED`), safe under concurrent workers.

**Lifecycle**:
`pending` → worker claims (`FOR UPDATE SKIP LOCKED`) → resolve tokens → FCM send →
`sent` (≥1 delivered) / `skipped` (no tokens / permission absent — FR-019, not a failure) /
`failed` (after attempt cap; alerted). Prunes dead tokens as a side effect (FR-018).

**Payload rule** (FR-021): carries only what routes and renders the notification — an `orderId`, a
deep-link target, a `type`. **Never** a name, address, phone, total, or free text.

---

## Client-side & provider-side contracts (not Postgres)

### Consent / telemetry state (client)
- **Customer**: `effy_analytics_consent` ∈ {`granted`,`denied`,`unknown`} in device storage
  (localStorage on web — exists today; a device pref on mobile). `granted` is the only state that loads
  the SDK. **Internal audiences** (shop/driver/back-office): **on by default, no per-user opt-out pref
  this slice** — mandatory + disclosed for employees, governed only by the platform kill switch (spec
  clarification Q4). A per-user internal opt-out is deferred to a later privacy/settings slice.
- **Kill switch**: `telemetry.enabled` (SSM, R10/R12) read at client startup; `false` ⇒ no init.

### Analytics Event (PostHog)
- Name from the **typed taxonomy** ([contracts/telemetry-taxonomy](contracts/telemetry-taxonomy.contract.md)).
- Super-property `surface` ∈ {`customer-web`,`shop-web`,`back-office`,`customer-mobile`,`shop-mobile`,
  `driver-mobile`}. Association by `sub` only. Props: ids + bounded enums; **no PII** (FR-008/022).

### Crash / Non-fatal Report (Crashlytics)
- Attributes: app/surface, version, platform, readable (symbolicated) stack; optional non-PII
  breadcrumbs/keys; `userId = sub` only when signed in. **No PII** (FR-003/022).

### FCM message ([contracts/fcm-payload](contracts/fcm-payload.contract.md))
- Built by the worker from a `notification_request`: `notification{title,body}` + `data{type,deepLink,
  entityId}`; platform blocks (`android`, `apns`) for channel/priority/sound. Non-PII only.
