# Contract: Notification preferences routes (111)

## Customer (shared gateway, `customer` service, customer pool authorizer)

### `GET /customer/v1/notification-preferences`

`200`:

```jsonc
{
  "categories": [
    {
      "category": "orders",
      "required": false,
      "marketing": false,
      "push": true, "email": true,                   // effective: the choice row, else the default
      "changeable": ["push", "email"]
    },
    { "category": "points", "required": false, "marketing": false, "push": false, "email": true, "changeable": ["push", "email"] },
    { "category": "offers", "required": false, "marketing": true,  "push": true, "email": false, "changeable": ["push"] },
    { "category": "news",   "required": false, "marketing": true,  "push": true, "email": false, "changeable": ["push"] },
    { "category": "important", "required": true, "marketing": false, "push": true, "email": true, "changeable": [] },
    { "category": "support",   "required": true, "marketing": false, "push": true, "email": true, "changeable": [] }
  ],
  "consent": {
    "offers": { "granted": false, "answeredAt": null },          // null = never answered
    "news":   { "granted": true,  "answeredAt": "2026-11-10T09:12:03.120Z" }
  },
  "askForOffers": false,             // no consent rows yet AND at least one paid order
  "wordingVersion": "marketing-2026-11"
}
```

- Words (labels, descriptions, reasons) are **not** on the wire. Clients read them from shared-types or legal-content.
- For a marketing category, `push` is the push choice. It takes effect only while consent is `granted`. The UI
  shows the push switch under the category's main (consent) switch.

### `PATCH /customer/v1/notification-preferences`

```jsonc
{
  "surface": "app",                        // "app" | "web" (the website's proxy always sends "web")
  "via": "settings",                       // "settings" | "prompt" | "inbox"; required with consent
  "changes": [ { "category": "orders", "channel": "push", "enabled": false } ],   // optional
  "consent": { "offers": true, "news": true },                                     // optional; each key optional
  "wordingVersion": "marketing-2026-11"   // required when consent is present
}
```

The request is one transaction, all or nothing. `200` returns the same body as GET.

Validation:

| Case | Response |
|---|---|
| neither `changes` nor `consent`; unknown field; bad surface/via | `400 invalid_preferences_change` |
| a category or channel not declared for customers, or not in `changeable` | `400 invalid_preferences_change` |
| a required category (important, support) | `400 category_required` |
| `consent` without `wordingVersion` | `400 invalid_preferences_change` |
| `wordingVersion` ≠ current | `409 consent_wording_changed` (the client re-reads and shows the new words) |

Notes:
- Each consent key writes one `customer_marketing_consent` row, even when the value equals the current one. An explicit
  answer is always recorded, so the prompt's "Not now" is recorded although the default was already off.
- A consent grant with no push choice row for that category writes none: the default (push on) applies.
- No live update is announced. Preferences are only ever shown on the screen that changed them; another surface reads on
  open (SC-007).

## Back-office (staff gateway, `orders` service, admin pool authorizer)

### `GET /orders/v1/customers/{customerId}/notification-preferences`

Roles: admin, manager, csa (read). Returns the same body as the customer GET, minus `askForOffers` and `wordingVersion`.
An unknown customer gives `404 customer_not_found`. **No write route exists for staff** (FR-026, Story 7).

### `GET /orders/v1/customers/{customerId}/consent/activity`

An `activityResponse` (104) over the source `customer-consent`. Its rows, newest first:
- "Said yes to offers" / "Said no to news";
- `actor`: the customer;
- detail: "In the app, on the order confirmation" / "On the website, in Notifications settings" / "From an offer in their
  inbox", plus "Wording marketing-2026-11".

It supports the drawer's search, type (Yes / No), dates, paging and CSV.

### `GET /orders/v1/notifications/settings`

```jsonc
{ "promoPushPerDay": 1, "promoPushPerWeek": 3, "updatedAt": "…", "updatedBy": "Jane (manager)" }
```

### `PUT /orders/v1/notifications/settings`

Roles: admin, manager (csa → 403 `forbidden`). Body `{ "promoPushPerDay": 2, "promoPushPerWeek": 5 }`.

- `400 invalid_notification_settings` when a value is not an integer in range, or the week value is below the day value.
- Writes `notification_settings_change` per changed field.
- Answers `200` with the GET body.

### `GET /orders/v1/notifications/settings/activity`

An `activityResponse` over `notification_settings_change`: "Changed promotional pushes per day from 1 to 2".

## Change map / live

Neither customer route changes an order, round, slot or stock, so both are listed **SILENT** in `change-map.guard.test.ts`.
The settings PUT is SILENT too: it changes nothing a screen shows live.
