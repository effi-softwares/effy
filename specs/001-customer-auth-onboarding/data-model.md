# Phase 1 Data Model: Customer Auth & Onboarding

The spec's four entities live in **three** stores. Only the profile data is in our Postgres;
identity/credentials and sessions are owned by Cognito and the device, respectively. This keeps
Auth Isolation clean (no password/credential material in our DB).

| Spec entity | Owned by | Notes |
|-------------|----------|-------|
| Customer Account (identity) | **Cognito customer pool** + mirrored in `customers` | Cognito holds email, verification status, the stable `sub`. We mirror the minimum (`cognito_sub`, `email`) so app data can FK to a customer. |
| Customer Profile | **Postgres `profiles`** | 1:1 with `customers`; created lazily on first authenticated call. |
| Verification Code | **Cognito custom-auth session** | OTP lives in `privateChallengeParameters`; never in our DB. |
| Session | **Device secure storage** (token set) + Cognito | Refresh/access/id tokens; "signed in" = valid refresh token. |

---

## Postgres schema (PostgreSQL 16, raw SQL, Goose forward-only)

### Table: `customers`

The local mirror of a Cognito customer identity. One row per Cognito user.

| Column | Type | Constraints | Source |
|--------|------|-------------|--------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | generated |
| `cognito_sub` | `text` | **UNIQUE NOT NULL** | JWT `sub` |
| `email` | `citext` | **UNIQUE NOT NULL** | JWT `email` (case-insensitive) |
| `created_at` | `timestamptz` | NOT NULL default `now()` | generated |
| `updated_at` | `timestamptz` | NOT NULL default `now()` | generated |

- `citext` (case-insensitive) enforces FR-013 "email is the unique account key" regardless of
  case. Requires `CREATE EXTENSION IF NOT EXISTS citext;` (+ `pgcrypto` for `gen_random_uuid`).
- `cognito_sub` is the join key from the JWT; `ON CONFLICT (cognito_sub) DO NOTHING` makes
  lazy-create idempotent and concurrency-safe.

### Table: `profiles`

The customer's profile, intentionally minimal this slice (spec Assumption: richer fields later).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `customer_id` | `uuid` | **UNIQUE NOT NULL**, FK → `customers(id)` ON DELETE CASCADE | enforces 1:1 |
| `display_name` | `text` | NULL | reserved for a later slice |
| `created_at` | `timestamptz` | NOT NULL default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL default `now()` | |

- `UNIQUE(customer_id)` enforces the one-profile-per-customer relationship.
- No PII beyond what identity already holds; email is not duplicated here (read via the join /
  the JWT) to keep a single source of truth.

### Relationships

```text
customers (1) ──< (1) profiles        # 1:1 via profiles.customer_id UNIQUE FK
```

### Indexes

- `customers`: unique on `cognito_sub`, unique on `email` (both back lookups + uniqueness).
- `profiles`: unique on `customer_id`.

---

## State transitions

### Account / profile lifecycle

```text
(no row)
   │  first authenticated GET /v1/profile  (JWT sub not found)
   ▼
INSERT customers ON CONFLICT (cognito_sub) DO NOTHING
   │  same transaction
   ▼
INSERT profiles (customer_id) IF NOT EXISTS
   │
   ▼
profile returned  ──(every later call)──>  existing row returned (no writes)
```

- Single transaction; safe under concurrent first-calls (the unique constraints serialize).
- No delete path this slice (account deletion is out of scope per spec).

### Session lifecycle (device + Cognito)

```text
SIGNED_OUT ──(OTP verified → tokens)──> SIGNED_IN (tokens in secure storage)
SIGNED_IN ──(app launch)──> silent REFRESH_TOKEN_AUTH
        ├─ success → SIGNED_IN (fresh access token)
        └─ refresh invalid/expired → SIGNED_OUT (graceful, US3 #3)
SIGNED_IN ──(sign out)──> clear secure storage → SIGNED_OUT (FR-008/FR-009)
```

---

## Validation rules (from requirements)

- Email format validated client-side before any code request (edge case: invalid email) and is
  ultimately constrained by Cognito + the `citext`/UNIQUE columns.
- `cognito_sub` and `email` are NOT NULL — a token missing either claim is rejected upstream by
  the JWT middleware, never reaching the repository.
- Uniqueness on both `cognito_sub` and `email` guarantees no duplicate accounts (FR-013).
- The profile row cannot exist without its customer (FK + cascade).

---

## Migration plan (Goose)

`services/api/migrations/00001_customers_profiles.sql` (forward-only):

1. `CREATE EXTENSION IF NOT EXISTS citext;` and `pgcrypto`.
2. `CREATE TABLE customers (...)` with the unique constraints above.
3. `CREATE TABLE profiles (...)` with the 1:1 FK.
4. Supporting indexes (created implicitly by the UNIQUE constraints).

No data backfill (greenfield, no production data per the brief).
