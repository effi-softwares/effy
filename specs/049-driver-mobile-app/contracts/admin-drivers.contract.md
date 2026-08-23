# Contract: Back-Office Driver Provisioning (`/admin/v1/drivers`)

Minimal `drivers/` domain added to `apis/edge-api/admin` (back-office authorizer). The **minimal adjunct**
so US1 has an account to sign in as — a full driver-management console is out of scope (spec). Follows the
009 shop-user pattern: **Cognito-first → record**, idempotent, RBAC from the `admin.staff` record.

DTOs in `@effy/shared-types`. RBAC: **read** = any active staff (incl. `csa`); **mutate** =
`admin`/`manager` only. IAM: scoped `cognito-idp` Admin actions on the **driver pool ARN** only (an
authorized provisioning write, not cross-pool auth — Principle IV holds, 009 R3).

## Routes

- `GET /admin/v1/drivers` → `[{ id, name, workEmail, zone, vehicle, status }]`
- `GET /admin/v1/drivers/{id}` → full record + audit.
- `POST /admin/v1/drivers` `{ name, workEmail, zoneId?, vehicleType?, vehiclePlate? }` → `{ id }`
  - `AdminCreateUser` in the **driver pool**, no password, `SUPPRESS` invite, `email_verified` (006/009
    pattern) → idempotent upsert of `public.driver` keyed on the returned `sub`. The driver signs in with
    passwordless 6-digit EMAIL_OTP (035 custom challenge, already on the pool). No self-signup path.
- `PATCH /admin/v1/drivers/{id}` `{ name?, zoneId?, vehicleType?, vehiclePlate? }` → `{ ok }`
- `POST /admin/v1/drivers/{id}/status` `{ status:"active"|"disabled" }` → `{ status }`
  - Disabling makes the driver's token non-authoritative immediately at the driver service (record is
    authoritative, Principle IV). Assignment stops; in-flight work returns to the pool on the next sweep.

## Notes

- No shop-style RBAC **groups** on the driver pool (Principle IV: customer and driver pools define none);
  the `driver` record alone carries status/zone/hub.
- Audit via the existing `admin.audit_log` (009).
- Back-office **UI** for this is a later slice; this contract is the API + Cognito wiring only.
