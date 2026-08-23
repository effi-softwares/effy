# Contract: Driver API (`/driver/v1/*`)

Cold-path service `apis/edge-api/driver`, attached to the shared HTTP API gateway with the **driver**
JWT authorizer (already provisioned; `driver_mobile` app client registered in its `extra_client_ids`).
Single **access-token** bearer. DTOs are the SSOT in `@effy/shared-types/src/driver.ts`, generated to
Kotlin; counts use `WireInt` (`@asType integer`) so the wire never carries `1.0` (027 R13). **No currency
field appears in any DTO.** Every mutating call accepts a `changeId` (uuid) for idempotency (R10).

Base: `https://<gateway>/driver/v1`. All routes require a valid driver token; the service resolves the
`driver` record from `sub` and **refuses a disabled driver** (403, uniform) regardless of a valid token.

## Identity & duty

- `GET /me` → `{ id, name, workEmail, zone, hub, vehicle, dutyStatus }`
  - Record-backed identity (+ idempotent JIT upsert on first call from `sub`, like 007/011). `zone`/`hub`
    are display strings; `hub` from `delivery_settings`.
- `POST /duty` `{ onDuty: boolean, changeId }` → `{ dutyStatus, since }`
  - Opens/closes a `driver_duty_session`. Off-duty removes assignment eligibility (FR-005/006). Refuses to
    go off duty with an in-progress step unless work is releasable (FR-011 edge case).
- `POST /location` `{ lat, lng, changeId }` → `204` — optional point-in-time snapshot (nearest-driver
  preference). Never continuous (R2). Omitted-permission → simply not sent.

## Today (phase-aware home)

- `GET /today` → `{ phase: "collection"|"same_day_delivery"|"idle", activeRun, active: {stop|drop},
  upNext: [...], remainingCount }`
  - The phase-aware home (FR-021): the active run + active stop/drop + queue + counts-only remaining. `idle`
    = on duty, no work (or off duty).

## Phase 1 — collection run

- `GET /collection/runs/{runId}` → `{ runId, status, stops: [{ taskId, sequence, shop:{name,address},
  packageCount, status }] }` (FR-013).
- `GET /collection/tasks/{taskId}` → `{ taskId, shop:{name,address}, packages: [{ ref, destinationSuburb,
  method:"same_day"|"standard", items:[{name, qty}] }], status }` (FR-014 — package manifest).
- `POST /collection/tasks/{taskId}/collect` `{ changeId }` → `{ status:"collected" }`
  - Advances the package's `shop_fulfillment` to `collected` (FR-014). Idempotent.
- `POST /collection/tasks/{taskId}/issue` `{ orderItemId?, kind:"missing"|"short", note?, changeId }` →
  `{ ok:true }` (FR-015) — does not block collecting the rest.

## The pivot — hub check-in

- `POST /hub/checkin` `{ runId, changeId }` → `{ scannedTotal, sameDayCount, standardCount }`
  - Ends the collection run (`checked_in`), returns the split (FR-016). Standard packages are staged for
    the external carrier and leave the driver's active work (FR-017). Requires every collection task
    terminal (`collected`/`short`). A "nothing same-day" result → `sameDayCount: 0` (empty variant).

## Phase 2 — same-day delivery run

- `GET /delivery/runs/{runId}` → `{ runId, status, drops: [{ dropId, sequence, orderRef,
  customerSuburb, packageCount, sameDay:true, window, status }] }` (FR-018).
- `GET /delivery/drops/{dropId}` → `{ dropId, orderRef, customer:{name}, address:{full, instructions},
  packages:[{ ref, fromShopCount }], status }` (FR-020 — one drop may aggregate packages from many shops).
- `POST /delivery/drops/{dropId}/status` `{ to:"out_for_delivery"|"en_route"|"arrived", changeId }` →
  `{ status }` (FR-019).
- `POST /delivery/drops/{dropId}/proof/presign` `{ contentType, changeId }` → `{ uploadUrl, mediaKey }`
  - Presigned PUT to the private media bucket for photo/signature (R7). Not needed for code/contactless.
- `POST /delivery/drops/{dropId}/proof` `{ method:"photo"|"code"|"signature"|"contactless", mediaKey?,
  code?, note?, changeId }` → `{ status:"delivered" }`
  - Verifies `code` server-side when method=code. Writes `proof_of_delivery` + advances every package's
    `shop_fulfillment` to `delivered` **in one transaction**; a drop cannot reach `delivered` without a
    proof (FR-026/027). Idempotent.
- `POST /delivery/drops/{dropId}/fail` `{ reason, note?, changeId }` → `{ status:"failed" }` (FR-028).

## Map data (US4 / P2)

- `GET /runs/{runId}/map` → `{ hub:{lat,lng}, stops:[{ id, kind:"shop"|"drop", lat, lng, sequence }],
  currentLocation? }` — feeds the per-run map (FR-029). Rendering/monochrome style is client-side (R5).

## Masked contact (US4 / P2)

- `POST /delivery/drops/{dropId}/contact` `{ mode:"call"|"message", changeId }` → `{ maskedChannel }`
  - Returns a masked relay handle (FR-023). **Capability-flagged** — until the masking relay exists (R6)
    this returns `503 {code:"contact_unavailable"}` and the client hides/disables the affordance.

## History & activity

- `GET /history?from&to` → `{ days:[{ date, runs:[{ runId, type, ... }], drops:[{ dropId, orderRef,
  customerSuburb, completedAt, proofCaptured:true }] }] }` (FR-033) — both record types.
- `GET /history/{kind}/{id}` → timeline (`driver_task_event`) + captured proof + addresses + packages,
  read-only (FR-034).
- `GET /activity` → `[{ id, type, body, createdAt, read }]` (FR-032); `POST /activity/read` `{ ids }`.

## Errors & isolation

- Uniform `403` for a disabled driver or another driver's resource (SC-008) — never discloses which term
  failed. `404` for a run/stop/drop that ended between read and act (like 029), mapped to a clear "no
  longer available" client state, never a generic crash. Offline writes retry with the same `changeId`.
