# Store audience — capability parity register

**Binding on**: `apps/shop-web` (Vite SPA) and `apps/shop-mobile` (KMP + Compose).
**Origin**: [specs/007-shop-web](../../specs/007-shop-web/) (FR-023a, SC-014).

The store audience is served by **two** surfaces. This file is the **single place** the platform
records what that audience can do and which surface delivers it. It exists so a capability added to
one surface cannot leave the other's state unstated — the drift that a two-surface audience
otherwise slides into silently.

> **Rule**: a change that adds or removes a store capability on either surface **must** update this
> table in the same change. A row with an unstated cell is a defect, not a TODO.

## Terminology

Client surfaces are `shop-*`. The backend service and its paths are `store`. The identity pool and
its gateway authorizer are `shop`. The audience, in prose, is "store".

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Delivered and verified on that surface |
| ⬜ | Outstanding — the capability exists for this audience but this surface does not have it |
| — | Not applicable to that surface |

## Baseline — established by 007-shop-web

| # | Capability | Web (`shop-web`) | Mobile (`shop-mobile`) | Backend it depends on |
|---|---|---|---|---|
| 1 | Passwordless EMAIL_OTP sign-in against the **shop** pool | ✅ | ⬜ | Cognito shop pool (001) |
| 2 | Session persists across restart; explicit sign-out clears it | ✅ | ⬜ | — |
| 3 | Protected areas unreachable when signed out; return-to-intent after sign-in | ✅ | ⬜ | — |
| 4 | Authenticated shell (navigation, current location, identity + sign-out) | ✅ | ⬜ | — |
| 5 | Record-backed identity read (subject, email, roles, status, assigned store) | ✅ | ⬜ | `GET /store/v1/me` |
| 6 | Role-aware interface: privileged controls hidden from `store_staff` / role-less | ✅ | ⬜ | — |
| 7 | Backend-authoritative manager gate (role **and** status **and** store scope) | ✅ | ⬜ | `GET /store/v1/manager-ping` |
| 8 | Graceful degraded / expired-session / denied states, no internal detail shown | ✅ | ⬜ | shared error envelope |
| 9 | Product analytics + error telemetry with a `surface` property, no PII | ✅ | ⬜ | PostHog |
| 10 | Cross-pool isolation: a store credential is refused by other audiences' services | ✅ | ⬜ | gateway JWT authorizers |

**Mobile column is outstanding by design.** `apps/shop-mobile` is still the base KMP template
(commonMain `Greeting`/`Platform` stubs). Building it is **out of scope for 007** (FR-023a) and is
its own slice.

## What the mobile bootstrap slice must build

Scoped directly from the ⬜ column above, so it does not have to be re-derived:

1. **Auth (rows 1–3)** — Amplify (or the Cognito SDK) against the **shop** pool, passwordless
   EMAIL_OTP, no password field. Session in secure storage; sign-out clears it. A signed-out user
   cannot reach a protected destination, and is returned to it after signing in.
2. **Shell (row 4)** — the app's navigation frame with the verified identity and sign-out, honouring
   iOS HIG / Android Material (constitution Principle V) rather than porting the web sidebar.
3. **Identity read (row 5)** — `GET /store/v1/me` through the Ktor client with the access token as
   bearer. Types come from the same contract as the web: `StoreStaffRecordDTO`. A role-less operator
   and an operator with no assigned store are **expected states**, not errors.
4. **Role-aware UI + gate (rows 6–7)** — hide manager-only destinations for `store_staff`; call
   `GET /store/v1/manager-ping` and render the uniform denial. **Never** treat the hidden control as
   the guard.
5. **Error contract (row 8)** — map the RFC 9457 problem envelope to the same states the web renders:
   `unauthenticated` → recover or re-auth · `forbidden` → denial · `unavailable` → degraded + retry.
6. **Telemetry (row 9)** — PostHog with `surface: "shop-mobile"`, plus Crashlytics per Principle VII.
   No PII beyond the subject id.
7. **Isolation (row 10)** — the app authenticates against the shop pool only, and presents its
   credential to `/store/v1/*` only.

Nothing in rows 1–10 requires a backend change: the store service already serves both surfaces.

## Shared contracts both surfaces are typed from

| Concern | Source of truth |
|---|---|
| Store roles, DTOs, tolerant role narrowing | `packages/shared-types/src/store.ts` |
| Endpoint shapes and error semantics | [store-me](../../specs/007-shop-web/contracts/store-me.contract.md) · [store-manager-ping](../../specs/007-shop-web/contracts/store-manager-ping.contract.md) |
| Cross-pool isolation guarantee | [cross-pool-isolation](../../specs/007-shop-web/contracts/cross-pool-isolation.contract.md) |
| Brand, dark mode, accent | `packages/design-system` (web) · the KMP theme package (mobile) |

## Deliberately NOT in the baseline

These belong to later slices and are listed so their absence is a decision, not an oversight:

- **Store management** — creating and editing stores, assigning staff to a store, and
  enabling/disabling an operator. **The next slice**, in the back-office console. 007 defines the
  `store` table and the authorization that depends on it, but ships **no way to create a store**
  (FR-019): no interface, no command, no seed file. No store row will ever exist that the product
  did not create.
- Role **management** from within the platform — the `cognito:groups` claim remains the origin of
  role assignment (constitution Principle IV).
- Any product store-operations capability: picking, packing, inventory, order handling (FR-025).
- Hosted deployment of either surface.

### What that defers

Because the manager gate inner-joins `store`, no operator can hold a store assignment until store
management ships. The gate's **negative half is fully proven now** — `store_staff`, role-less, and an
unassigned `store_manager` are each refused, which is the store-scope term doing real work. Its
**positive half** (a manager *served* at an active store), the **inactive-store** denial, and the
**disabled-operator** denial are verified in the store-management slice, against data the product
created. All three terms are implemented and unit-tested in 007.
