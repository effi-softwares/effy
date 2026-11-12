# Contracts: routes in 115

Gateways after 115: shared **189/300** (+2), staff **240/300** (+6). No route is merged to fit.

## Shared gateway: `customer` service (public, no authorizer)

### `POST /customer/v1/email-unsubscribe`

Turns email for offers and news off for the token's customer.

```jsonc
// body (the website page), or the query string ?t=…&m=… (a mail program's RFC 8058 one-click: body "List-Unsubscribe=One-Click")
{ "token": "base64url-43", "messageId": "uuid (optional)" }
// 200, always the same shape - a wrong token reveals nothing
{ "ok": true, "undoable": true }   // or { "ok": false, "undoable": false }
```

- It is written by `preferences.ts` (`unsubscribeFromEmail`), the one writer of choices and consent (111's guard). It
  writes two choice rows (offers and news, channel `email`, off, `surface = 'email'`) and, for each category that was on,
  a consent "no"
  (`channel = 'email'`, `surface = 'email'`, `via = 'email_link'` or `'one_click'`, `message_id`).
- Idempotent: a second call writes nothing new and still answers `ok: true`.
- No rate limiter (the edge has none shared). A wrong token costs one indexed lookup, and 32 random bytes cannot be
  guessed.
- The website page calls it from the browser **after loading**, never during the server render, so a mail scanner opening
  the link unsubscribes nobody.
- Emits `EmailUnsubscribes{source}`.

### `POST /customer/v1/email-unsubscribe/undo`

```jsonc
{ "token": "…" }   →   200 { "ok": true }  |  { "ok": false }
```

- It restores the email switches to their state before the latest `email_link` / `one_click` "no" rows, and writes
  consent yes rows (current email wording, `via = 'email_link'`).
- It only works within 7 days of the unsubscribe. After that the customer uses settings.

## Shared gateway: `customer` service (customer authorizer), changed

### `PATCH /customer/v1/notification-preferences` (111)

- Accepts `{ category: "offers" | "news", channel: "email", enabled }`.
- Turning email **on** requires `emailWordingVersion` equal to the current `marketing-email-*` version, else
  `409 consent_wording_changed`. It also requires the category's notifications consent to be yes, else
  `400 consent_required`, because email for offers means nothing without offers.
- Every email change writes a consent row (R2).
- `GET` returns the email switches and the current email wording.

## Staff gateway: `admin-messages` stack (admin authorizer)

| Route | Roles | Notes |
|---|---|---|
| `GET /admin/v1/messages/automations` | admin, manager, csa | `parseListQuery`; search name; filter status, mode; sort name, next run, last run, id |
| `POST /admin/v1/messages/automations` | admin, manager | body `AutomationDraft`; validated with 112's message rules plus the schedule or trigger; starts `active` |
| `GET /admin/v1/messages/automations/{id}` | admin, manager, csa | the automation plus its last 50 runs |
| `PATCH /admin/v1/messages/automations/{id}` | admin, manager | `version` required, `409 automation_changed` when stale; future runs only |
| `POST /admin/v1/messages/automations/{id}/state` | admin, manager | `{ action: "pause" \| "resume" \| "end", version }`; resume recomputes `next_run_at` from now |
| `GET /admin/v1/messages/automations/{id}/activity` | admin, manager, csa | `activityResponse` over `message_automation_event` |

The paths sit under 112's `/admin/v1/messages…` prefix, which `admin-messages` owns. HTTP API routing prefers the literal
`automations` segment over 112's `{id}`, so `/admin/v1/messages/automations…` never reaches a message route. A route
test asserts it.

**Refusals**:
- `400 invalid_automation` names the field. Possible causes: a trigger for drivers or shops, a trigger kind other than
  offer or news, `{first name}` in the title, a weekly repeat with no days, `ends_on` before `starts_on`, a value out of
  range.
- `403` for a CSA.

**Changed 112 routes**:
- **create, edit draft**: accept `email` and `nameFallback`. `{first name}` in the title is `400`.
- **audience count**: takes the same filter.
- **test send**: 112 sends to the test account the sender picks, through `notify()`. When `email` is on, the admin service
  **also sends the email itself** (email-kit `message`, straight to that account's address, not through `notify()`, so the
  switches don't hide it). The subject starts `Test: ` (112's prefix) and nothing is recorded or counted. The stack gains
  `ses:SendEmail`.
- **report**: gains `email`.

**Live**: after each write, announce `ops` `messages` (112's kind). Customer surfaces need nothing live.

## Email (`message` template)

- **Headers** on marketing kinds:
  - `List-Unsubscribe: <https://edge-api.<zone>/customer/v1/email-unsubscribe?t=<token>&m=<messageId>>`
  - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- **Body link**: `https://<customer-web>/email/unsubscribe?t=<token>&m=<messageId>`.
- Subject = title. Preheader = the body's first line with the fallback filled in. Footer per research R5.
