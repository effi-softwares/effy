# Data Model: Messages That Do More (115)

One migration, `db/migrations/20261113090000_messages_email_automation.sql`. It only adds or widens; its Down reverses it.

## Changed: `public.customer_marketing_consent` (111, append-only)

| Change | Rule |
|---|---|
| **+ `channel text NOT NULL DEFAULT 'notifications'`** | `CHECK (channel IN ('notifications', 'email'))`. Existing rows are 111's notification answers |
| `surface` CHECK widened | `app`, `web`, **`email`** (the unsubscribe page or a mail program's one-click) |
| `via` CHECK widened | `prompt`, `settings`, `inbox`, **`email_link`**, **`one_click`** |
| **+ `message_id uuid NULL`** | FK `public.message(id)` ON DELETE SET NULL. The message whose email was used to unsubscribe, for its report |

- ⚠ **`marketing_consent_current` is redefined** to read only `channel = 'notifications'` rows. Otherwise an email answer
  would become "the latest answer for offers" and change who gets offers at all.
- A new view, `marketing_email_consent_current`, gives the latest `channel = 'email'` row per (customer, category), for
  back-office's consent history and the undo.
- `notify()` still reads the switch (`customer_notification_choice` channel `email`), not this log (research R2).

## Changed: `public.customer_notification_choice` (111) - amended after `/speckit-analyze` C1, C2

| Change | Rule |
|---|---|
| **DROP `customer_notification_choice_channel_ck`** | It allowed only `push` rows for offers and news ("not sent by email yet") and would refuse every email switch. The category's `changeable` list in the policy now governs, enforced by `preferences.ts` |
| `surface` CHECK widened | `app`, `web`, **`email`**: choice rows written by the unsubscribe page or one-click |

The Down restores both (it first deletes offer/news email rows and rows with `surface = 'email'`, which only 115 writes).

## Changed: `public.customer`

| Column | Rule |
|---|---|
| **+ `email_unsubscribe_token text NULL UNIQUE`** | 32 random bytes, base64url (43 characters). Set on the first marketing email by the messages worker. NULLed by erasure (113) |

## Changed: `public.message` (112)

| Column | Rule |
|---|---|
| **+ `email boolean NOT NULL DEFAULT false`** | Customer audiences only (`CHECK`). Service kinds email everyone with an address; offer and news only those with the switch on |
| **+ `name_fallback text NOT NULL DEFAULT 'there'`** | 1–20 characters, no `{` `}` |
| **+ `automation_id uuid NULL`** | FK `message_automation(id)`. Set on messages an automatic message created |
| `title` CHECK | **refuses `{first name}`** (`title NOT ILIKE '%{first name%'`) |

The audience filter jsonb gains one key for automatic runs: `{ "automationRun": "<run id>" }` (research R6), which only the
worker writes.

## New: `public.message_automation`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | 1–80 characters, staff-facing |
| `kind` | text | as `message.kind`; a trigger only `offer`/`news` (CHECK) |
| `audience` | text | `customer` / `driver` / `shop`; a trigger only `customer` |
| `filter` | jsonb | 112's audience filter (validated by the same code) |
| `title`, `body`, `image_key`, `destination`, `push`, `email`, `name_fallback` | as `message` | |
| `mode` | text | `trigger` / `repeat` |
| `trigger_kind` | text NULL | `not_ordered_days` / `cart_left_hours` |
| `trigger_value` | int NULL | days 7–365, hours 1–72 |
| `repeat_every` | text NULL | `day` / `week` / `month` |
| `repeat_days` | int[] NULL | ISO weekdays 1–7, for `week` |
| `repeat_date` | int NULL | 1–28, for `month` (no 29–31: every month has the date) |
| `repeat_time` | time NULL | Effy clock |
| `starts_on`, `ends_on` | date NULL | `ends_on >= starts_on` |
| `status` | text | `active` / `paused` / `finished` |
| `next_run_at` | timestamptz NULL | NULL when paused or finished |
| `activated_at` | timestamptz | reset on resume; triggers match only moments at or after it |
| `version` | int | optimistic lock (409 on a stale edit) |
| `created_by`, `created_at`, `updated_at` | | |

CHECKs: the trigger columns are set exactly when `mode = 'trigger'`, and the repeat columns exactly when
`mode = 'repeat'`.

## New: `public.message_automation_run` (append-only)

`id`, `automation_id`, `ran_at`, `matched int`, `message_id uuid NULL` (NULL when zero matched), `outcome`
(`sent_to_message` / `nobody` / `waited`). Index (automation_id, ran_at DESC).

## New: `public.message_automation_recipient`

`automation_id`, `customer_id` (ON DELETE CASCADE), `occurrence_key text`, `run_id`, `created_at`.
**UNIQUE (automation_id, customer_id, occurrence_key)**: the "never twice for the same occurrence" rule. ⚠ 113's erasure
keeps the customer row, so the cascade never fires. **Erasure deletes the customer's rows explicitly** (amended, I4).

## New: `public.message_automation_event` (append-only)

`id`, `automation_id`, `kind` (`created` / `edited` / `paused` / `resumed` / `ended` / `finished`), `actor_sub`, `facts jsonb`,
`created_at`. The source of its activity drawer (104).

## Unchanged, read

- `email_delivery_status` (038 deliverability): `undeliverable` / `complained` suppress marketing email (R4).
- `customer_notification_choice` (111): the email switch rows for offers and news.

## Contract changes (shared-types)

| Type | Change |
|---|---|
| `notification-categories.ts` | offers and news `changeable: ["push", "email"]` (+ the fixture and the Kotlin twins) |
| `messages.ts` | `MessageDTO` / draft + `email`, `nameFallback`; `FIRST_NAME_PLACEHOLDER`; `fillFirstName(text, name)`; `MessageReportDTO.email {sent, failed, notSent: {noAddress, off, suppressed}, unsubscribed}` |
| new `message-automations.ts` | `AutomationDTO`, `AutomationDraft`, `AutomationRunDTO`, `TRIGGERS` (kind, label, unit, limits), `REPEAT_EVERY`, `nextRunAt(schedule, after, tz)` (pure, unit-tested) |
| `notification-preferences.ts` (111) | `PreferencesChange` email toggles carry `emailWordingVersion` when turning on |
| new `email-unsubscribe.ts` | `UnsubscribeRequest {token, messageId?}`, `UnsubscribeResponse {ok, undoable}` |
| `live.ts` | none (automations announce `messages`) |

`@effy/legal-content`: `consent/marketing-email.json` (version `marketing-email-2026-11`, **draft**), generated consent
export and the app's twin. `@effy/email-kit`: template `message` (+ `CATALOG` entry, MJML).
