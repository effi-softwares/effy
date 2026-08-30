# Contract — `effy-edge-fleet` (`/fleet/v1/*`)

**Audience**: back-office **only**. Every route carries the **existing back-office JWT authorizer**
(`/effy/<env>/edge/authorizer/back-office_id`) on the shared HTTP gateway. No new Cognito pool, no new
authorizer. A token from any other pool is rejected structurally at the gateway (Principle IV).

**Authorization** is decided from `admin.staff`, never from the `cognito:groups` claim alone (FR-023):

- **read** — any `admin.staff` row with `status = 'active'`, **including `csa`** (FR-022).
- **mutate** — active **and** role ∈ {`admin`, `manager`}.

Fail-closed: an authorization query that throws returns **503**, never an implicit allow.

**Errors** are RFC-7807 problem documents via `@effy/edge-shared`'s `problem()`. Field errors are
carried in **`errors`** (⚠ not `fields` — 053 recorded that drift; 054 fixed `toDomainError` in
`@effy/api-client` to read the wire's real key).

**Refusal codes used**: `400` validation · `401` no subject · `403` insufficient role ·
`404` not found · `409` conflict (duplicate work email, concurrent edit) · `503` infrastructure.

---

## Health

| Method | Path | Auth |
|---|---|---|
| GET | `/fleet/healthz` | none |
| GET | `/fleet/readyz` | none |

---

## Driver register & profile

### `GET /fleet/v1/drivers` — read
Query: `q` (name or email, partial) · `status` (`active|suspended|offboarded`, repeatable) ·
`zoneId` · `includeOffboarded` (default **false**, FR-005) · `cursor` · `limit` (default 25, max 100).

→ `200 { items: AdminDriverListItem[], nextCursor: string | null }`

⚠ Ordered `(name, id)`; the cursor is minted from **the same expression** (research R9). `nextCursor`
**must be consumed by the UI** — 053 shipped one no screen read, capping its console at 25 rows.

### `GET /fleet/v1/drivers/{driverId}` — read
→ `200 AdminDriverProfile` · `404`

Includes `accountState` (`ok | record_only | identity_only`) so a half-provisioned driver **shows the
discrepancy** rather than rendering as normal (spec edge case, research risk 1).

### `POST /fleet/v1/drivers` — mutate
Body `AdminDriverCreateRequest` — `name`, `workEmail` required; every profile field optional.

→ `201 AdminDriverProfile`
→ `409` **work email already in use** — the problem document names the existing driver's id, name and
status (FR-014). ⚠ It **never** edits or re-activates them. This is a behaviour change: today the
create path upserts on conflict and `ensureDriverUser` re-enables a disabled account.

### `PATCH /fleet/v1/drivers/{driverId}` — mutate
Body `AdminDriverUpdateRequest` + required `updatedAt` (concurrency token, research R12).

⚠ **Absent ≠ null.** A key absent from the body leaves the field alone; a key present with `null`
**clears** it (FR-010). `workEmail` is **not accepted** (research R7).

→ `200 AdminDriverProfile` · `400` · `404` · `409` (modified by someone else)

### `POST /fleet/v1/drivers/{driverId}/status` — mutate
Body `{ status: "active"|"suspended"|"offboarded", reason: string, acknowledgeHeldWork?: boolean }`

→ `200 AdminDriverProfile`
→ `409 held_work` when the driver holds started work and `acknowledgeHeldWork` is not `true` — the
problem document itemises what is held and which orders it affects (FR-020). Re-submitting with the
flag proceeds and the held work becomes **stranded** (FR-021).

Disables/enables the identity account in the same operation (FR-016).

### `GET /fleet/v1/drivers/{driverId}/history` — read
Query: `from`, `to`, `cursor`, `limit`. → `200 { items: DriverRunSummary[], nextCursor, summary: DriverPeriodSummary }`
(FR-039, FR-043)

### `GET /fleet/v1/drivers/{driverId}/audit` — read
→ `200 { items: DriverAuditEntry[] }` — newest first (FR-025).

---

## Runs & proof

### `GET /fleet/v1/runs/{runId}` — read
→ `200 DriverRunDetail` — ordered stops/drops with the time each state was reached (FR-040).

### `GET /fleet/v1/drops/{deliveryTaskId}/proof` — read
→ `200 { method, mediaUrl: string | null, note, capturedAt, capturedByDriverId }` · `404`

⚠ `mediaUrl` is a **time-limited presigned URL** (`presignRead`, research R4) — never a durable
address. Issuing it writes `admin.audit_log` action `driver.proof.viewed` (FR-042). ⚠ That records the
**issuing**, not the fetching.

---

## Duty & assignment

### `GET /fleet/v1/duty` — read
→ `200 { onDuty: OnDutyDriver[], overdueSessions: OnDutyDriver[], unassigned: UnassignedWorkSummary }`
(FR-034, FR-035, FR-036, FR-037)

### `POST /fleet/v1/duty/{sessionId}/end` — mutate
→ `200` · `404` · `409` if already ended (FR-037).

### `GET /fleet/v1/stranded` — read
→ `200 { items: StrandedWork[] }` — each with the driver, the work, and the affected order (FR-021).

### `POST /fleet/v1/stranded/release` — mutate
Body `{ collectionTaskIds?: string[], deliveryTaskIds?: string[], note: string }`
→ `200 { released: WireInt }` (FR-021)

⚠ **No route in this service accepts a target driver id for work.** Assignment stays automatic
(FR-038); release returns work to the pool and the sweep decides. A test asserts this over the whole
route table rather than trusting review.

---

## Exceptions

### `GET /fleet/v1/exceptions` — read
Query: `kind` (`delivery_failure|collection_issue`) · `resolved` (default **false**) · `driverId` ·
`from`/`to` · `cursor` · `limit`.
→ `200 { items: DriverException[], nextCursor, outstandingCount: WireInt }` (FR-027–FR-029, FR-032)

Each item carries `orderId` + `orderReference` so the console links to the order in one step (FR-030).

### `POST /fleet/v1/exceptions/{kind}/{exceptionId}/resolve` — mutate
Body `{ note: string }` → `200 DriverException` · `404` · `409` if already resolved (FR-031).

---

## Readiness

### `GET /fleet/v1/readiness` — read
→ `200 { blocked: BlockedDriver[], uncoveredZones: ZoneCoverage[], expiring: ExpiringCredential[] }`
(FR-044, FR-045, FR-046)

`blocked[].reasons` is an enumerated cause list — `no_zone | suspended | offboarded | licence_expired`
— never a bare boolean.

---

## DTOs

All live in `packages/shared-types/src/driver.ts`, expanding the existing `AdminDriver*` family rather
than duplicating it (Principle II). Integer counts are `WireInt` (027 R13), money appears **nowhere**
(FR-049), and no DTO carries a driver's phone or emergency contact into any list payload — they appear
on the profile response only.

**No Kotlin is generated.** Verified: `apps/driver-mobile` has no `core/contract/` directory and no
drift guard; only `cm-`/`sm-` contract targets exist in the `Makefile`.
