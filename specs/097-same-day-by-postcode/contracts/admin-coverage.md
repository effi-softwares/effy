# Contract: Coverage routes, as extended by 097

Staff gateway (`staff-api.<zone>`), `admin` service, back-office authorizer. **No new route.**
Writes: `admin` and `manager` roles (unchanged gate); `csa` reads. Every successful write announces
`{ scope: "ops", kind: "coverage" }` after commit (unchanged).

## `GET /admin/v1/delivery/coverage`

New query parameters (both optional, combinable with the existing `group`, `q`, `source`, `review`,
`cursor`):

| Param | Values | Meaning |
|---|---|---|
| `today` | `offered` \| `not_offered` | Only postcodes with that setting. Anything else → 400 `invalid_request`. |
| `minKm` | decimal ≥ 0, ≤ 2 dp | Only postcodes at least this far from the hub. Anything else → 400 `invalid_request`. |

Response additions:

```jsonc
{
  "postcodes": [
    { "postcode": "3220", "places": ["GEELONG"], "state": "VIC", "groupId": "…",
      "distanceKm": "64.48", "distanceSource": "computed", "needsReview": false,
      "todayOffered": false }            // NEW
  ],
  "counts": { "listed": 13, "manualDistance": 0, "needsReview": 0,
              "todayNotOffered": 2 }     // NEW — over the whole list, not the page
}
```

## `PATCH /admin/v1/delivery/coverage/postcodes`

```jsonc
{ "postcodes": ["3220", "3030"], "todayOffered": false }
```

- `todayOffered` may be combined with `groupId` in one request; `distance` stays one-postcode-only.
- 1–500 postcodes (unchanged limit). Non-boolean `todayOffered` → 400 `invalid_request`.
- A postcode not on the list → 404 `not_listed`, **nothing written** (all or nothing).
- Postcodes already at the requested value are left untouched and not audited; the request still
  succeeds (idempotent).
- 204 on success.

Audit: one `coverage.postcode.today` row — `{ before: { "<postcode>": <old> }, after: <new> }`, listing
only postcodes that changed.

## `POST /admin/v1/delivery/coverage/postcodes`

```jsonc
{ "postcodes": [{ "postcode": "3220" }], "groupId": null, "todayOffered": false }
```

`todayOffered` optional, default `true`, applies to every postcode added by the request. Already-listed
postcodes are reported in `alreadyListed` and **not** changed (unchanged behaviour). Audit `after` gains
`todayOffered`.

## `GET /admin/v1/delivery/coverage/check?q=`

Each match gains `todayOffered: boolean | null` — the listed postcode's setting, `null` when the
postcode is not on the list.

## Customer contract (`commerce`, shared gateway) — no change

`POST /commerce/v1/checkout/quote` and the payment-intent call keep their shapes. For an address whose
postcode has Delivery today not offered:

- `effyWindows.days` contains **no** `section: "same_day"` entry; later days as before.
- `effyWindows.asap`, when present, resolves at the intent to the first later day.
- A `deliveryWindow` naming today is refused exactly as any window no longer on offer
  (`date_unavailable`), nothing written.
