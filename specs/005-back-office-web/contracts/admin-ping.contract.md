# Contract — `GET /v1/back-office/admin/ping` (edge-api, NEW)

**Feature**: 005 (FR-018/020, spec Clarification Option B + persistence) · **Service**:
`services/edge-api` (cold path) · **Status**: to build this slice.

The **administrator-only** proving endpoint that lets the console prove *backend-authoritative*
inter-role gating (US3).

**Build order (decouple):** **US3 (P3)** ships this route authorizing on the **role claim**
(`hasAnyGroup('admin')`) — independently testable, no DB. **US4 (P4)** upgrades authorization to
the **platform DB record** (FR-020): `admin.staff.status = 'active'` **AND** an `admin.staff_role`
with `role_key = 'admin'` — **not the token claim** — so a `disabled` staff row is refused despite
a valid admin token. *This contract describes the US4 end state* (the authorization table below is
the DB-backed version; the US3 interim swaps `authorizeAdmin(sub)` for `hasAnyGroup`).

## Request

```
GET /v1/back-office/admin/ping
Authorization: Bearer <admin-pool ACCESS token>
```

- **Authorizer**: the existing `backOfficeJwt` HTTP API JWT authorizer (issuer = admin pool,
  audience = admin app-client id). A non-back-office token never reaches the handler (Principle
  IV). Unversioned health aside, the route carries `/v1` per `docs/api/versioning-policy.md`.

## Authorization (from the platform DB record — FR-020)

| Caller (DB record via `staff` service) | Result |
|---|---|
| `status='active'` AND has role `admin` | **200** + body below |
| active but role `manager`/`csa` only | **403** `forbidden` problem+json |
| `status='disabled'` (any role, incl. admin) | **403** `forbidden` problem+json (SC-012 — valid token, still denied) |
| no staff record / role-less | **403** `forbidden` problem+json |
| missing/expired/tampered/other-pool token | **401** at the authorizer (never reaches handler) |

The handler calls `staff.authorizeAdmin(subject)` (reads `admin.staff` + `admin.staff_role`) —
**not** `hasAnyGroup` on the token. The token claim seeds roles (via `/me`) but the **decision**
is the DB's. (A `/me` upsert normally precedes any admin call; `authorizeAdmin` treats a missing
record as denied.)

## Response 200

```json
{ "audience": "back-office", "scope": "admin", "subject": "<sub>", "message": "pong" }
```
No product data (foundation-only). `subject` is the authenticated `sub`.

## Response 403 (non-admin) — shared error contract

Per `docs/api/error-envelope.md` (RFC 9457), the existing `forbidden(scope)` helper:
```json
{ "type": ".../problems/forbidden", "title": "Forbidden", "status": 403,
  "detail": "you do not have access to this resource", "instance": "<request id>" }
```

## Implementation notes

- New handler `src/functions/back-office-admin-ping-v1-get.ts` — reuse `preamble`, `subject`,
  `forbidden`, `json` from `lib/`; call `staff.authorizeAdmin(subject)` (see
  [staff-schema.contract.md](./staff-schema.contract.md)). `warn`-log a denial (`sub` only, no
  email/PII).
- `serverless.yml`: new function `backOfficeAdminPingV1` → `httpApi GET /v1/back-office/admin/ping`
  with `authorizer.name: backOfficeJwt`; add its 3 alarms (Errors>0, Throttles>0, Duration p95)
  matching `BackOfficePingV1*`.
- **CORS**: add `http://localhost:5173` to `params.default.corsOrigins` so the locally-run
  console (approved dev origin) can call it. Requires an operator `make edge-deploy ENV=dev`.
- Test: admin+active → 200; manager/csa → 403; **admin+disabled → 403**; no record → 403
  (repository tests against local Postgres + handler tests with typed fake events).
- `docs/api/`: one-line note registering the new route.
