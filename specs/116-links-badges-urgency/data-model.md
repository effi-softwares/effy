# Data Model: Reaching the Right Place (116)

## `public.notification_badge_correction` (new)

A queue of "this person's badge is out of date". One row per person and audience; the drain empties it.

| Column | Type | Rule |
|---|---|---|
| recipient_sub | text NOT NULL | the person (the same subject as `notification.recipient_sub`) |
| audience | text NOT NULL | `customer` or `driver` (CHECK); the shop console's badge is live already |
| requested_at | timestamptz NOT NULL DEFAULT now() | the earliest request still waiting; an upsert keeps it (`LEAST`) |

- **PK** (recipient_sub, audience): combining is structural (FR-014).
- **Index** on `requested_at` for the drain's claim.
- **Writers** (three, `badge.guard.test.ts` holds them):
  - `@effy/edge-shared/notifications` `badge.ts` queues (insert/upsert);
  - the drain's `worker/badge.ts` claims (DELETE … RETURNING);
  - erasure (113, `customer/src/erasure/repository.ts`) deletes an erased customer's rows with their notifications. They
    hold no personal detail, but a dead row would push to tokens that are already gone.

## `public.notification_badge_sweep` (new, one row)

| Column | Type | Rule |
|---|---|---|
| id | smallint PK | always 1 (CHECK) |
| swept_to | timestamptz NOT NULL | the expiry sweep's watermark; moved forward by the sweep's own statement |

Written only by `badge.ts`'s sweep SQL (run by the drain).

## Index (new)

`notification_expiring_unseen_idx` on `notification (expires_at) WHERE seen_at IS NULL AND archived_at IS NULL AND
expires_at IS NOT NULL`: the sweep's range scan.
- **Revoked** from `effy_shopper` (the queue is written by service code on the owner role).

## Derived, not stored

- **The badge number**: the unseen count (110: listed, `seen_at IS NULL`, not archived, not expired). It is read at send time,
  never stored.
- **`keep` (Android)**: the ids of the person's latest 50 unseen items at send time.
- **Urgency**: `interruptionLevelFor(importance, category)`, computed per push, never stored.

## Configuration (not data)

| Name | Where | Empty means |
|---|---|---|
| `android_app_cert_sha256` (list, **no default**) | `<env>.tfvars` → customer-web build env `APP_LINK_ANDROID_SHA256` | `[]`: no `assetlinks.json` (404); links open the website |
| `apple_team_id` (**no default**) | `<env>.tfvars` → customer-web `APP_LINK_APPLE_APP_ID` (with `apple_customer_bundle_id`), SSM `/effy/<env>/apple/team_id` (`off` when empty) → notifications `APPLE_TEAM_ID` | `""`: no association file; no `time-sensitive` (a value counts only if it matches `^[A-Z0-9]{10}$`) |
| `WEB_SITE_HOST` | customer app build config (`secrets.properties` / env) | the app claims no host |
