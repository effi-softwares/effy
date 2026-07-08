# Contract — `GET /v1/back-office/me` (edge-api, NEW)

**Feature**: 005 (FR-005/019) · **Service**: `services/edge-api` (cold path) · **Status**: to
build this slice.

The staff-identity read: the console's record-backed identity read **and** the JIT touchpoint that
records/refreshes the staff member in the platform's own system of record. **Delivered at US4**;
until then the console's P2 proving read uses the existing 004 `/v1/back-office/ping` (token echo),
then **graduates** to `/me` here. Unlike `/ping` (which denies role-less), `/me` **admits any
authenticated back-office caller incl. role-less** — because its job is to *record* them.

## Request

```
GET /v1/back-office/me
Authorization: Bearer <back-office ACCESS token>
```
Behind the existing `backOfficeJwt` authorizer (Principle IV). Any authenticated back-office
caller (any role, incl. role-less) is admitted to *this* endpoint — it is the "who am I in the
platform" read; privilege gating happens on `/admin/ping`.

## Behavior (records, then returns)

1. Extract `subject` (+ `email` from the token if present) and `cognito:groups`.
2. `staff.upsertOnContact(subject, email, groups)` — idempotent JIT create/refresh + role
   reconcile (see [staff-schema.contract.md](./staff-schema.contract.md)). Write-on-read is a
   deliberate, idempotent last-seen/provisioning side-effect (research F4).
3. Return the platform record.

## Response 200

```json
{ "subject": "<sub>", "email": "<email>", "roles": ["admin"], "status": "active", "lastSeenAt": "<iso8601>" }
```
- `roles` reflect the platform record (seeded from the token this slice); `status` is
  platform-owned. Maps to `StaffRecord` in the console (`shared-types`).
- A **role-less** member returns `roles: []`, `status: 'active'` — recorded, admitted to nothing
  privileged (the console renders the no-privileges state).

## Errors (shared contract, `docs/api/error-envelope.md`)

- `401` at the authorizer for missing/expired/tampered/other-pool tokens (never reaches handler).
- `503`/`unavailable` problem+json if the DB is unreachable (cold start / allowlist) — the
  console renders the degraded state (FR-009); no internal detail leaked.

## Implementation notes

- Handler `src/functions/back-office-me-v1-get.ts` → `staff.service` → `staff.repository`
  (three-layer slice, Principle VI). Reuse `preamble`/`json`/`problem` from `lib/`.
- `serverless.yml`: function `backOfficeMeV1` → `httpApi GET /v1/back-office/me`,
  `authorizer.name: backOfficeJwt`; 3 alarms matching the pattern.
- Tests: first call creates the record + returns it; second call updates `last_seen_at` with no
  duplicate; role-less returns `roles: []`.
- **PII**: `email` is returned to the authenticated owner and stored in the DB, but **never
  logged/telemetried** (Principle VII) — log lines stay `subject`-only.
