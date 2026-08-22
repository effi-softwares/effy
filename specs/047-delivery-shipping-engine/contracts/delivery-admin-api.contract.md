# Contract: Back-office delivery configuration API (cold path)

`apis/edge-api/admin` — a new `delivery/` domain behind the **back-office** authorizer. Path scheme
`/admin/v1/delivery/...`. RBAC from the `admin.staff` record: **read** = any active staff (incl. `csa`);
**mutate** = `admin`/`manager`. Every mutation writes `admin.audit_log` (who + when). DTOs in
`@effy/shared-types/src/delivery-admin.ts`. This service **validates** but **never computes a customer
fee** (the engine's single home is the hot path).

## Zones & serviceability

- `GET  /admin/v1/delivery/zones` — list zones (name, ring, sameday flag, postcode count, health flags).
- `POST /admin/v1/delivery/zones` · `PATCH .../zones/:id` — create/rename, set `status`, set
  `sameday_eligible`, set/override `ring_id` (`ring_is_overridden=true` when it differs from suggestion).
- `GET  /admin/v1/delivery/zones/:id/postcodes` · `POST` (add by locality) · `DELETE` (remove).
  - **Add is by place** (FR-006): the request carries a chosen `locality` (name+state+postcode); the
    service adds the **postcode**. The response for a candidate postcode **lists every other place it also
    makes serviceable and the count** (FR-008) so the console can confirm before commit.
  - Adding a postcode already in another zone ⇒ `409 {"error":"postcode_in_zone","zone":"MEL-INNER"}` (FR-009).
  - A postcode with **no** matching locality ⇒ `200` with `{"warning":"unknown_postcode"}`; it is accepted
    only with `confirm:true` (FR-010) — never silently, never hard-blocked.
- `GET /admin/v1/delivery/health` — zones flagged: unknown-place postcodes, zones with no postcodes,
  active zones whose ring the plan does not price. A clean config returns an empty list (FR-027-equiv).

## Rings & suggestion

- `GET /admin/v1/delivery/rings` · `POST` · `PATCH` — the ordered ring set (code, name, ordinal,
  `suggest_upper_km`, status). Exactly one open-ended (null `suggest_upper_km`) ring.
- `POST /admin/v1/delivery/zones/:id/suggest-ring` — recompute the zone's representative point (mean of
  its postcodes' locality coordinates) and Haversine distance from `delivery_settings` hub; return the
  suggested ring + `hub_distance_km`. ⚠ A zone whose postcodes have no coordinate returns
  `{"suggested":null,"reason":"no_coordinate"}` — the admin assigns a ring by hand; it is never defaulted
  to the nearest ring (R4). The suggestion is advisory; the admin's chosen `ring_id` wins.

## Fee plans

- `GET /admin/v1/delivery/plans` — list; exactly one `is_active:true`.
- `POST /admin/v1/delivery/plans` · `PATCH .../plans/:id` — create/edit an **inactive** plan: name,
  `rounding_step`, `floor_amount`, `cap_amount`, `same_day_factor`, `standard_factor`, its
  `ring_price[ring]` rows, its `weight_band[upperGrams]` rows. CHECKs enforce a≥b, cap/floor multiples of
  step, cap≥floor (the create/edit surfaces these as field errors).
- `POST /admin/v1/delivery/plans/:id/activate` — the single-action switch (FR-049). **Refused** with the
  gap named if the plan is incomplete (FR-051):
  - `422 {"error":"plan_incomplete","missing_rings":["OUTER"]}` — an active ring has no price;
  - `422 {"error":"plan_incomplete","reason":"no_weight_bands"}` — no weight slab defined.
  On success, the previously active plan becomes inactive in the same transaction; **new** quotes use the
  new plan; already-captured order quotes are untouched (FR-036/SC-013). Zones and same-day eligibility are
  **not** affected (FR-050).

## Same-day eligibility & per-shop exceptions

- Zone eligibility is set via `PATCH .../zones/:id { "samedayEligible": true }` (FR-037).
- `GET  /admin/v1/delivery/sameday-exceptions?shop=<id>&zone=<id>` — list.
- `PUT  /admin/v1/delivery/sameday-exceptions` `{ shopId, zoneId, mode: "on"|"off" }` — upsert one
  per-(shop,zone) override (FR-043). `DELETE .../:id` removes it (reverting to the zone default).
- ⚠ **There is no shop-facing route to any of this** (FR-045) — verified by the shop service exposing
  none, not only by the UI hiding it.

## Collection schedule & settings

- `GET/POST/PATCH/DELETE /admin/v1/delivery/collection-runs` — the daily runs (`run_time`, label, status).
  One or many (FR-040). Times are Australia/Melbourne wall-clock.
- `GET/PUT /admin/v1/delivery/settings` — the singleton: hub `latitude`/`longitude`,
  `samedayPrepBufferMin`. Hub coordinates and buffer feed ring suggestion and the derived same-day cutoff.

## Product weight (shop authorizer, existing `edge-api/shop` products domain)

- `PATCH /shop/v1/products/:id` gains `weightGrams` (int > 0) and sets `weightIsAssumed=false` when a real
  weight is recorded (FR-054). A products list may filter `assumedWeight:true` to surface products still
  needing a real weight (FR-055).
