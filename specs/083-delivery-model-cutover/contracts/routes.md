# Contracts: 083 routes and wire changes

## Stage 1 — `admin` service, staff gateway

### `GET /admin/v1/delivery/go-live` (read = any active staff)
```jsonc
{
  "readiness": {
    "ready": false,
    "items": [
      { "key": "coverage", "required": true, "ready": true,  "detail": "412 postcodes listed", "fixAt": "/delivery?tab=coverage" },
      { "key": "windows",  "required": true, "ready": false, "detail": "No delivery window is defined", "fixAt": "/delivery?tab=slots" },
      { "key": "drivers",  "required": false, "ready": false, "detail": "No driver may deliver", "fixAt": "/drivers" }
    ]
  },
  "switch": {
    "state": "off",                       // off | scheduled | on
    "at": null,                           // ISO instant when scheduled / on
    "setBy": null, "setAt": null,         // from the audit trail
    "canTurnBack": false,                 // on, and stage 2 not applied
    "removedAt": null                     // stage 2 applied
  },
  "legacy": { "open": 3, "lastClosedAt": null, "alertAfterDays": 7 },   // null while the switch is off
  "history": [ { "at": "…", "action": "set", "value": "…", "by": "Sam Admin", "reason": null } ]
}
```

### `PUT /admin/v1/delivery/go-live/switch` (write = admin only)
```jsonc
{ "at": "2026-10-20T19:00:00.000Z" | "now" | null, "reason": "…", "expected": null }
```
| Status | Code | When |
|---|---|---|
| 200 | — | the new `switch` block |
| 400 | `validation_failed` | bad instant; turning back without a reason |
| 403 | — | not an admin |
| 409 | `not_ready` | required items failing — `items` in the body |
| 409 | `changed` | `expected` ≠ the stored value |
| 409 | `removed` | turning back after stage 2 |

### Orders list (existing) — `GET /orders/v1/orders?delivery=legacy&open=true`
`open=true` narrows to old-kind orders still open (research R5).

## Stage 2 — removals from existing contracts

- `POST /commerce/v1/checkout/intent`: `deliveryMethod`, `sameDaySlotId`, `standardDate` no longer read.
- Quote DTO: per-package `feeAmount`, `sameDaySlots`, `sameDayUnavailable`, `standardDays`, `standardFee`
  removed; `effyWindows` or `courier` is always present for a serviced address.
- Admin delivery settings: `standardLookaheadDays`, `carrierLeadDays` removed; group `samedayEligible` removed.
- Kept as compatibility (not removed): driver `kind: "same_day_delivery"`, `sameDayCount`,
  `standardCount`, `CollectionPackage.method`; shop `deliveryMethod`.
