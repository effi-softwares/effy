# Contracts: 082 routes and wire changes

## NEW `GET /fleet/v1/dispatch/windows?date=YYYY-MM-DD` (staff gateway, read = any active staff)

```jsonc
{
  "days": [{ "date": "2026-10-13", "label": "Today", "isToday": true }, { "date": "2026-10-14", "label": "Wed 14 Oct", "isToday": false }],
  "date": "2026-10-14",
  "windows": [{
    "windowStart": "…", "windowEnd": "…", "label": "Wed 14 Oct, 4 pm – 6 pm",
    "round": null,                         // or { "roundId", "driver": { "id", "name" }, "opensAt" } — null before its day: planned on the day
    "parcels": [{
      "packageId": "…", "orderId": "…", "orderNumber": "EFY-…", "status": "at_hub",   // 073's words
      "collectLate": false, "coldOvernight": true, "group": "Inner East"              // group name or null
    }]
  }]
}
```
`date` omitted → today. A date not on sale → 400. Never a customer name or address beyond what dispatch
already shows; never "same-day" / "standard".

## Driver — `POST /driver/v1/hub-checkin` response (shared gateway, existing)

Adds (additive; the previous app ignores them):
```ts
effyCount: number
effyGroups: { date: string; windowStart: string | null; windowEnd: string | null; label: string; count: number }[]
```
`courierCount` (080) unchanged. `sameDayCount`, `standardCount` remain, deprecated (E9).
The task/phase kind value `same_day_delivery` is unchanged on the wire (an identifier, never shown).

## Fleet — driver capabilities (existing routes)

`method` is no longer accepted or returned: a capability is `{ function: "collection" | "delivery", zoneId: string | null }`.
A request that still sends `method` is accepted and the field ignored. Coverage gaps are per (group, function).

## Fleet — `POST …/assignments/assign` (existing)

New refusal: `409 not_yet` — "This delivery is for <day>. Its round is planned on the day." (a delivery
parcel whose window's day has not come).

## Orders — list filter `needsDriver` and the per-parcel assignment read (existing)

Meaning changes per research R6; shapes unchanged.

## Dispatch reads (existing board / unassigned)

`method` removed from rows; `collectLate` added to unassigned collection rows.
