# Contracts: Effy Delivery Coverage

**Feature**: 076. DTOs live in `@effy/shared-types` (`delivery.ts`, `delivery-admin.ts`) and are
mirrored into the Kotlin contract where a mobile app reads them. Errors are RFC 9457 problems with the
`code` named.

## Shared words — `packages/shared-types/src/delivery.ts`

```ts
export type CoverageKind = "effy" | "courier" | "none";
export const COVERAGE_LABEL = { effy: "Delivered by Effy", courier: "Courier delivery" } as const;
export const COVERAGE_REFUSAL_CODE = "address_not_covered";
export const COVERAGE_REFUSAL_SENTENCE = "Sorry, we can't deliver to this address.";
```

⚠ No customer DTO carries a group, a distance, a reason, or the hub (FR-023).

---

## Customer-facing (shared gateway) — existing routes, one new field each

### `GET /storefront/v1/serviceability?postcode=3121` — public

```json
{ "postcode": "3121", "serviced": true, "coverage": "effy" }
```
`serviced` = `coverage !== "none"`, kept for released clients. Cache: `public, max-age=300`.

### `customer` address routes (list, create, update)

Each address object gains `"coverage": "effy" | "courier" | "none"`, computed when read.

### `POST /commerce/v1/checkout/quote`

Response gains `"coverage"`. When `none`: `serviced: false`, no packages, as today.
A checkout step refused for coverage: `422`, `code: "address_not_covered"`,
`detail: COVERAGE_REFUSAL_SENTENCE`.

---

## Back-office — service `admin`, **staff gateway**, back-office authorizer

Read = any active staff. Write = `admin`, `manager`.

### `GET /admin/v1/delivery/coverage?group=&q=&source=&review=&cursor=`

Everything the screen shows, in one read.

```json
{
  "postcodes": [
    { "postcode": "3121", "places": ["Richmond", "Burnley", "Cremorne"], "state": "VIC",
      "groupId": "…", "distanceKm": "3.40", "distanceSource": "computed", "needsReview": false }
  ],
  "nextCursor": "…",
  "groups": [ { "id": "…", "name": "Inner Melbourne", "postcodeCount": 42, "driverCount": 6 } ],
  "ungrouped": { "postcodeCount": 3, "driverCount": 2 },
  "courier": { "offered": false, "canBeOffered": false,
               "exclusions": [ { "postcode": "7255", "reason": "No chilled courier service" } ] },
  "counts": { "listed": 45, "manualDistance": 2, "needsReview": 0 }
}
```
`group=none` filters to ungrouped. `source=manual|computed`. `q` matches postcode or place prefix.

### `GET /admin/v1/delivery/coverage/places?q=rich`

Place search for the add dialog (≥ 2 characters; digits search postcodes).

```json
{ "results": [
  { "postcode": "3121", "state": "VIC", "matched": "Richmond",
    "places": ["Richmond", "Burnley", "Cremorne"],
    "listed": false, "computedDistanceKm": "3.40" },
  { "postcode": "2753", "state": "NSW", "matched": "Richmond", "places": ["Richmond", "…"],
    "listed": false, "computedDistanceKm": "712.80" }
] }
```
`computedDistanceKm: null` → a manual distance is required to add it.

### `GET /admin/v1/delivery/coverage/check?q=3121` — replaces `postcode-check`

```json
{ "postcode": "3121", "places": ["Richmond", "…"], "coverage": "effy", "reason": "listed",
  "groupName": "Inner Melbourne", "distanceKm": "3.40", "distanceSource": "computed",
  "exclusionReason": null }
```
A place name returns one entry per matching postcode (`{ "matches": [ … ] }`).
`reason`: `listed` · `courier_offered` · `courier_off` · `courier_excluded` · `unknown_postcode`.

### `POST /admin/v1/delivery/coverage/postcodes`

```json
{ "postcodes": [ { "postcode": "3121", "manualDistanceKm": null } ], "groupId": null,
  "confirmNoDrivers": false }
```
→ `201 { "added": ["3121"], "alreadyListed": [] }`

| HTTP | `code` | When |
|---|---|---|
| 422 | `unknown_postcode` | not in the place data |
| 422 | `distance_required` (+ `postcodes`) | no computable distance and none given |
| 422 | `distance_out_of_range` | not 0–5000 |
| 404 | `group_not_found` | |
| 409 | `no_driver_covers` (+ `driverCount: 0`) | the target group / ungrouped has no cleared driver and `confirmNoDrivers` is not true (research R6) |

### `PATCH /admin/v1/delivery/coverage/postcodes`

Bulk change of group and/or one postcode's distance.

```json
{ "postcodes": ["3121", "3122"], "groupId": "…" }            // or "groupId": null
{ "postcodes": ["3121"], "distance": { "source": "manual", "km": "4.00" } }
{ "postcodes": ["3121"], "distance": { "source": "computed" } }
```
`409 distance_not_computable` when returning to `computed` is impossible. A distance change takes
exactly one postcode.

> **As built:** twelve routes, not thirteen — the distance change rides on the one `PATCH …/postcodes`.
> `PUT /delivery/settings` is the existing route.

### `DELETE /admin/v1/delivery/coverage/postcodes/{postcode}`

→ `204`. `404 not_listed`. Orders already placed are untouched (nothing reads the list for them).

### `POST /admin/v1/delivery/coverage/groups` · `PATCH …/groups/{id}` · `DELETE …/groups/{id}`

`{ "name": "Bayside" }` → `201 { "id": "…" }` · `409 group_name_taken`.
`DELETE` ungroups the group's postcodes and retires it:
→ `200 { "ungrouped": 12 }` · `409 no_driver_covers` unless `?confirmNoDrivers=true`.

### `PUT /admin/v1/delivery/coverage/courier`

`{ "offered": true }` → `409 courier_ordering_unavailable` until courier ordering exists (research R7).

### `POST /admin/v1/delivery/coverage/courier/exclusions` · `DELETE …/exclusions/{postcode}`

`{ "postcode": "7255", "reason": "No chilled courier service" }` → `201`.
`422 unknown_postcode` · `422 reason_required` · `409 already_excluded`.

### `PUT /admin/v1/delivery/settings` (existing) — response gains

```json
{ "distances": { "recomputed": 41, "unchanged": 0, "manualFlagged": 2 } }
```
present when the hub point changed.

### Removed

`POST /delivery/rings` · `POST /delivery/zones` · `PATCH /delivery/zones/{id}` ·
`GET /delivery/zones` · `POST|DELETE /delivery/zones/{id}/postcodes…` ·
`GET /delivery/zones/{id}/suggest-ring` · `GET|PUT|DELETE /delivery/zones/{id}/sameday-exceptions…` ·
`GET /delivery/postcode-check`. **Kept**: `GET /delivery/rings` (the fee-plan dialog, until E3).

---

## Shared library — `@effy/edge-shared/delivery`

```ts
coverageForPostcode(q, postcode): Promise<Coverage>
  // { kind, reason, distanceKm: number | null, groupId: string | null, groupName: string | null }
serviceableForPostcode(q, postcode): Promise<boolean>     // kind === "effy"   (until E5)
zoneForPostcode(q, postcode): Promise<Zone | null>        // rebuilt on coverageForPostcode + R5 bridges
COURIER_ORDERING_AVAILABLE: false                         // E5 flips it
```

## Live

`LIVE_KINDS` gains `"coverage"` — ops channel only.
