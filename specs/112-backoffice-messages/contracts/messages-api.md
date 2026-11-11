# Contract: Messages routes (112)

All routes are on the **staff gateway**, stack `admin-messages` (`apis/edge-api/admin/serverless.messages.yml`), behind
the back-office authorizer. Roles are decided from `admin.staff` (R13):
- **manage**: admin or manager;
- **staff**: any active staff, CSA included.

DTOs live in `packages/shared-types/src/messages.ts`.

## Shapes

```jsonc
// MessageDraftDTO: the body of create and edit
{
  "kind": "announcement",                 // announcement | important | offer | news | direct
  "title": "Hub opens at 7 tomorrow",     // 1–60
  "body": "Effy's hub opens an hour late on Friday 14 Nov. Collections start at 7:30.",   // 1–500
  "pictureKey": null,                     // from the picture route, or null
  "push": true,
  "endsAt": null,                         // ISO, or null
  "audiences": [
    {
      "audience": "driver",
      "filter": { "deliveryToday": true },            // the closed shape (R4); {} = everyone
      "destination": { "kind": "today" }              // 109's destination for that audience
    }
  ]
}

// MessageDTO: get, and the result of every write
{
  "id": "…", "kind": "…", "title": "…", "body": "…",
  "pictureUrl": "https://media.dev.effyshopping.com/promotions/messages-…/….webp" | null,
  "push": true, "endsAt": null,
  "audiences": [ { "audience": "driver", "filter": {…}, "destination": {…}, "report": MessageReportDTO | null } ],
  "status": "draft",                       // draft | scheduled | sending | sent | stopped | cancelled | withdrawn | not_sent
  "notSentReason": null,                   // "too_many_recipients"
  "sendAt": null, "sentAt": null, "withdrawnAt": null,
  "duplicatedFrom": null,
  "version": 3,
  "createdBy": "Jane (manager)", "createdAt": "…",
  "total": MessageReportDTO | null,        // null until sending starts
  "reportFrozenAt": null                   // set once the numbers are final (R15)
}

// MessageReportDTO (R15): each group's parts add up to its total
{
  "matched": 1240,                         // people the filters matched while sending
  "reached": 1204,                         // inbox items written
  "noConsent": 36,                         // offer/news only: matched − reached
  "push": {                                // all zero when push is false; parts sum to reached
    "sent": 1100, "noDevice": 60, "failed": 2, "muted": 4, "turnedOff": 10, "overLimit": 20,
    "heldForNight": 0, "waiting": 8, "notSentEnded": 0
  },
  "seen": 900, "opened": 412, "archived": 33
}
```

## Routes

| # | Method and path | Role | Purpose |
|---|---|---|---|
| 1 | `GET /admin/v1/messages` | staff | the list: `parseListQuery` with `q` (title), `kind`, `audience` and `status` filters; sort `created`, `sent` or `title`, ending in the id; rows are `MessageRowDTO {id, title, kind, audiences[], status, sendAt, sentAt, reached, openedShare}` |
| 2 | `POST /admin/v1/messages` | manage; staff for `direct` | create a draft from `MessageDraftDTO` plus an optional `fromMessageId` (duplicate). `201 MessageDTO` |
| 3 | `GET /admin/v1/messages/{id}` | staff | `MessageDTO`, with the report computed or frozen |
| 4 | `PUT /admin/v1/messages/{id}` | manage | edit: `MessageDraftDTO` plus `version`. Only `draft` and `scheduled` |
| 5 | `POST /admin/v1/messages/audience-count` | staff | `{kind, audiences[{audience, filter}], resolve?: {emails: string[]}}` → `{audiences: [{audience, matched, consented: number \| null}], total, resolved?: {ids: string[], notFound: number, repeated: number}}` |
| 6 | `POST /admin/v1/messages/{id}/picture` | manage | `{contentType, fileSize}` → `{uploadUrl, key}` (R9) |
| 7 | `POST /admin/v1/messages/{id}/test` | manage; staff for `direct` | `{audience, personId}` → `{inbox: "written" \| "not_written", reason: "no_consent" \| null, push: "queued" \| "skipped" \| "capped" \| "held" \| "none"}` |
| 8 | `POST /admin/v1/messages/{id}/send` | manage; staff for `direct` (no `sendAt`) | `{version, sendAt?: ISO, confirmCount, typedCount?}` → `MessageDTO` (`sending` or `scheduled`) |
| 9 | `POST /admin/v1/messages/{id}/cancel` | manage | `scheduled` → `cancelled` |
| 10 | `POST /admin/v1/messages/{id}/stop` | manage | `sending` → `stopped` |
| 11 | `POST /admin/v1/messages/{id}/withdraw` | manage | `sent`, `stopped` or `sending` → `withdrawn` (R8) |
| 12 | `GET /admin/v1/messages/{id}/activity` | staff | `activityResponse` over `message_event` (source `message`) |
| 13 | `GET /admin/v1/messages/received?audience=…&id=…` | staff | `activityResponse` over the source `messages-received` (R16) |

`/admin/v1/messages/audience-count` and `/admin/v1/messages/received` are literal paths. They are declared alongside
`{id}`, which HTTP API matches literal-first.

## Validation and refusals

| Case | Response |
|---|---|
| unknown field; bad kind, audience, filter key or value; title or body out of range; `endsAt` not after `sendAt` | `400 invalid_message` |
| an audience the kind does not allow (an offer to drivers); a `direct` message with more or fewer than one person | `400 invalid_message` |
| a destination not on that audience's list | `400 invalid_destination` |
| an unknown filter key or value | `400 invalid_audience` |
| offer or news words without "Effy" (send, schedule, test) | `400 message_must_name_effy` |
| a CSA doing anything other than reading, or creating, testing and sending now a `direct` message to one person | `403 forbidden` |
| a stale `version` | `409 message_changed` |
| edit, send or schedule outside `draft` / `scheduled`; cancel outside `scheduled`; stop outside `sending`; withdraw outside `sending` / `sent` / `stopped` | `409 message_not_editable` |
| the count is above `max_recipients_per_message` | `409 too_many_recipients` `{count, limit}` |
| the count differs from `confirmCount` by more than 5% | `409 audience_changed` `{count}` |
| a customer audience with no filter and `typedCount ≠ count` | `409 confirmation_required` `{count}` |
| a direct message to a closed customer, deactivated driver or closed shop | `409 recipient_unavailable` |
| an unknown message | `404 message_not_found` |

## Settings (existing 111 routes, extended)

`GET` and `PUT /orders/v1/notifications/settings` gain `maxRecipientsPerMessage` (1–200,000).
- A manager's PUT that changes it gives `403 forbidden`. A manager may still change the promotion limits.
- Each change writes `notification_settings_change` and shows in the CN page's activity, e.g. "Changed the largest
  message from 20,000 to 25,000 people".

## Inbox read (existing 110 routes, extended)

`InboxItemDTO` gains `imageUrl: string | null` on all three audiences' inbox routes. Nothing else changes.

## Change map / live

- None of the routes change an order, round, slot or stock. They are listed **SILENT** in `change-map.guard.test.ts`.
- The back-office's own re-read is the ops kind `messages`. Routes 2, 4 and 8–11 announce it after commit, and so does
  the worker (R3).
