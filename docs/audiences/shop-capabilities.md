# Shop audience — capability parity register

**Binding on**: `apps/shop-web` (Vite SPA) and `apps/shop-mobile` (KMP + Compose).
**Origin**: [specs/007-shop-web](../../specs/007-shop-web/) (FR-023a, SC-014).

The shop audience is served by **two** surfaces. This file is the **single place** the platform
records what that audience can do and which surface delivers it. It exists so a capability added to
one surface cannot leave the other's state unstated — the drift that a two-surface audience
otherwise slides into silently.

> **Rule**: a change that adds or removes a shop capability on either surface **must** update this
> table in the same change. A row with an unstated cell is a defect, not a TODO.

## Terminology

**One name: `shop`.** The surfaces, the identity pool, its gateway authorizer, the backend service,
its route paths, its tables, its roles, and the audience in prose. There is no second word for this
audience anywhere in the platform.

This is normative (constitution v1.6.0, Principle IV) and enforced mechanically: `make verify-naming`
fails on any occurrence of the retired token that is not attributable to a documented exclusion —
the TanStack Store library, the customer "storefront", AWS "Parameter Store", or the English verb.
The earlier `shop`/`store` split was retired by
[specs/008-shop-naming-unification](../../specs/008-shop-naming-unification/).

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Delivered and verified on that surface |
| ⬜ | Outstanding — the capability exists for this audience but this surface does not have it |
| ⏸ | Deferred by design — a documented constitution deviation, not an oversight (see below) |
| — | Not applicable to that surface |

## Baseline — established by 007-shop-web, mobile delivered by 014-shop-mobile-foundation

| # | Capability | Web (`shop-web`) | Mobile (`shop-mobile`) | Backend it depends on |
|---|---|---|---|---|
| 1 | Passwordless EMAIL_OTP sign-in against the **shop** pool | ✅ | ✅ | Cognito shop pool (001) |
| 2 | Session persists across restart; explicit sign-out clears it | ✅ | ✅ | — |
| 3 | Protected areas unreachable when signed out; return-to-intent after sign-in | ✅ | ✅ † | — |
| 4 | Authenticated shell (navigation, current location, identity + sign-out) | ✅ | ✅ | — |
| 5 | Record-backed identity read (subject, email, roles, status, assigned shop) | ✅ | ✅ | `GET /shop/v1/me` |
| 6 | Role-aware interface: privileged controls hidden from `shop_staff` / role-less | ✅ | ✅ | — |
| 7 | Backend-authoritative manager gate (role **and** status **and** shop scope) | ✅ | ✅ ‡ | `GET /shop/v1/manager-ping` |
| 8 | Graceful degraded / expired-session / denied states, no internal detail shown | ✅ | ✅ | shared error envelope |
| 9 | Product analytics + error telemetry with a `surface` property, no PII | ✅ | ⏸ | PostHog |
| 10 | Cross-pool isolation: a shop credential is refused by other audiences' services | ✅ | ✅ | gateway JWT authorizers |

**Mobile delivered by [014-shop-mobile-foundation](../../specs/014-shop-mobile-foundation/)** (KMP +
Compose, Clean Architecture + MVVM, native Amplify auth). Code-complete + build-verified on Android and
iOS; runs on both. Ported from 013's foundation with the shop deltas (single access-token bearer,
EMAIL_OTP-only, the RBAC gate).

**Footnotes:**
- **† Row 3 (return-to-intent):** shop-mobile is **login-first**, so protected areas are unreachable when
  signed out *by construction* (nothing is reachable without signing in). "Return-to-intent" has no target
  yet — the foundation has a single post-login destination and no deep links — so it is deferred to the
  first slice that adds a deep-linkable destination (014 T035). The *guarantee* (no protected access while
  signed out) holds today; only the *convenience* is deferred.
- **‡ Row 7 (manager gate):** the gate is delivered, and its **negative half** — `shop_staff`, role-less,
  and an **unassigned** `shop_manager` each refused with a **uniform** denial — is implemented and
  unit-tested. Its **positive half** (a manager *served* at an active shop → *Granted*) plus the
  inactive-shop / disabled-operator denials need **009** shop data, so live sign-off is **partial by
  design**, exactly as 007's is. See *What that defers* below.
- **⏸ Row 9 (telemetry):** **deferred for shop-mobile** — a documented Principle VII deviation shared with
  013's customer-mobile (the `mobile-telemetry` closing slice). PostHog/Crashlytics wiring is not in the
  bootstrap; recorded here so the register does not overstate what mobile delivers (014 FR-038, SC-015).

## What the mobile bootstrap slice built (014)

Scoped directly from what was the ⬜ column, and **delivered by 014** (rows 1–8, 10; row 9 deferred):

1. **Auth (rows 1–3)** — Amplify (or the Cognito SDK) against the **shop** pool, passwordless
   EMAIL_OTP, no password field. Session in secure storage; sign-out clears it. A signed-out user
   cannot reach a protected destination, and is returned to it after signing in.
2. **Shell (row 4)** — the app's navigation frame with the verified identity and sign-out, rather than
   porting the web sidebar. **Behaviour** is native on each platform; **visual chrome** is Material 3 on
   both (a recorded Principle V deviation — see *Constitution deviations* below). Tablet-first layout
   (FR-003a): a window-size-driven shell, not a stretched phone column.
3. **Identity read (row 5)** — `GET /shop/v1/me` through the Ktor client with the access token as
   bearer. Types come from the same contract as the web: `ShopStaffRecordDTO`. A role-less operator
   and an operator with no assigned shop are **expected states**, not errors.
4. **Role-aware UI + gate (rows 6–7)** — hide manager-only destinations for `shop_staff`; call
   `GET /shop/v1/manager-ping` and render the uniform denial. **Never** treat the hidden control as
   the guard.
5. **Error contract (row 8)** — map the RFC 9457 problem envelope to the same states the web renders:
   `unauthenticated` → recover or re-auth · `forbidden` → denial · `unavailable` → degraded + retry.
6. **Telemetry (row 9)** — **DEFERRED** (Principle VII deviation, below). PostHog `surface:
   "shop-mobile"` + Crashlytics are not in the bootstrap; they land in the shared `mobile-telemetry`
   slice. When built: no PII beyond the subject id.
7. **Isolation (row 10)** — the app authenticates against the shop pool only, and presents its
   credential to `/shop/v1/*` only.

Nothing in rows 1–10 requires a backend change: the shop service already serves both surfaces.

## Constitution deviations (014 — both shared with 013's customer-mobile)

Two deviations are taken **knowingly** by the mobile bootstrap and recorded here and in
[plan.md](../../specs/014-shop-mobile-foundation/plan.md) *Complexity Tracking* (they must match). Both
are shared with 013 so the two mobile surfaces stay consistent, and each names the slice that closes it —
a deviation is only legitimate while it has an owner.

| # | Principle | Deviation | Why | Closes in |
|---|---|---|---|---|
| 1 | **V — Design** | iOS renders **Material 3 chrome**, not full Apple HIG component parity. *Behaviour* (scroll, back-gesture, text, accessibility) is native on both platforms; only the visual component language is shared. | A single Compose UI ships to both platforms in the bootstrap; a HIG-conformant SwiftUI shell is a distinct body of work, and isolating presentation now means adopting it later touches only that layer. | `iOS native shell` slice |
| 2 | **VII — Observability** | **No telemetry** on mobile — no PostHog analytics, no Crashlytics — so row 9 is ⏸, not ✅. | Telemetry is a cross-cutting concern better wired once, across all three mobile apps, than bolted per-slice; the bootstrap's job is the auth + identity + gate spine. | `mobile-telemetry` slice |

Neither deviation weakens a security property: authorization is still backend-decided (row 7), the
credential is still pool-isolated (row 10), and no PII is emitted (there is nothing emitting at all yet).

## Shared contracts both surfaces are typed from

| Concern | Source of truth |
|---|---|
| Shop roles, DTOs, tolerant role narrowing | `packages/shared-types/src/shop.ts` |
| Endpoint shapes and error semantics | [shop-me](../../specs/007-shop-web/contracts/shop-me.contract.md) · [shop-manager-ping](../../specs/007-shop-web/contracts/shop-manager-ping.contract.md) |
| Cross-pool isolation guarantee | [cross-pool-isolation](../../specs/007-shop-web/contracts/cross-pool-isolation.contract.md) |
| Brand, dark mode, accent | `packages/design-system` (web) · the KMP theme package (mobile) |

## Deliberately NOT in the baseline

These belong to later slices and are listed so their absence is a decision, not an oversight:

- **Shop management** — creating and editing shops, assigning staff to a shop, and
  enabling/disabling an operator. **The next slice**, in the back-office console. 007 defines the
  `shop` table and the authorization that depends on it, but ships **no way to create a shop**
  (FR-019): no interface, no command, no seed file. No shop row will ever exist that the product
  did not create.
- Role **management** from within the platform — the `cognito:groups` claim remains the origin of
  role assignment (constitution Principle IV).
- Any product shop-operations capability: picking, packing, inventory, order handling (FR-025).
- Hosted deployment of either surface.

### What that defers

Because the manager gate inner-joins `shop`, no operator can hold a shop assignment until shop
management ships. The gate's **negative half is fully proven now** — `shop_staff`, role-less, and an
unassigned `shop_manager` are each refused, which is the shop-scope term doing real work. Its
**positive half** (a manager *served* at an active shop), the **inactive-shop** denial, and the
**disabled-operator** denial are verified in the shop-management slice, against data the product
created. All three terms are implemented and unit-tested in 007.

## 015 — Mobile app shell & adaptive navigation

`apps/shop-mobile` gains a production **navigation shell** (spec 015): a top-level session gate
(login-first — sign-in is the only public screen, every tab requires the session) wrapping an
**adaptive** primary navigation — a **bottom bar on a phone, a navigation rail on a tablet** — over four
tabs (**Home · Catalog · Orders · Account**), each with its own back stack. Catalog/Orders are
"coming soon" placeholders until their slices land; the identity block is sectioned rows (no card,
DOCTRINE-2); sign-out lives in the Account tab and returns to sign-in. Built on the shared
`packages/mobile-kit` (adaptive shell + per-tab back stacks) on stable Material 3. Verified: compiles +
unit tests green on Android, links for iOS. **Web (`shop-web`) is unaffected** — this is a mobile-only
navigation capability. Live device/simulator sign-off is the operator's step.

## 016 — Product catalog management (web delivered; mobile presentation retired by 018)

`apps/shop-web` and `apps/shop-mobile` gain the **product catalog** (spec 016): each shop authors
**shop-owned** products against a back-office-managed schema (product types + a dynamic attribute
library + a category taxonomy, `apis/edge-api/admin` `catalog/`), browses them in a
backend-paginated/searched/filtered table, and views/edits each on a sectioned/tabbed detail page
with **focused edits** — all **no cards** (DOCTRINE-2), modelled on eBay item-specifics + Uber Eats
menus (DOCTRINE-1). Backend: `apis/edge-api/shop` `products/` + `sections/` (shop authorizer; every
query scoped to the operator's resolved shop; EAV attribute typing; optimistic-concurrency focused
edits; draft-first create with publish-time mandatory enforcement; private-S3 presigned media).

| # | Capability | Web (`shop-web`) | Mobile (`shop-mobile`) | Backend it depends on |
|---|---|---|---|---|
| 16.1 | Read the catalog schema (types + attributes + category tree) that drives the create form | ✅ | ⬜ | `GET /shop/v1/catalog/schema` |
| 16.2 | Create a product via a schema-driven multi-step form with a **device-local draft** (FR-012) | ✅ | ⬜ | `POST /shop/v1/products` |
| 16.3 | Backend search / filter / sort / paginate the shop's products (< 1s at 10k+, SC-004) | ✅ | ⬜ | `GET /shop/v1/products` |
| 16.4 | Sectioned/tabbed product detail; **schema-drift notice** (FR-020a) | ✅ | ⬜ | `GET /shop/v1/products/{id}` |
| 16.5 | Focused edits with **optimistic concurrency** — stale ⇒ reload (FR-023a) | ✅ | ⬜ | `PATCH /shop/v1/products/{id}` |
| 16.6 | Lifecycle: publish (re-validates mandatory + primary image) / unavailable / archive | ✅ | ⬜ | `POST /shop/v1/products/{id}/status` |
| 16.7 | Guarded hard-delete (draft only; else archive) (R8) | ✅ | ⬜ | `DELETE /shop/v1/products/{id}` |
| 16.8 | Shop-local **sections**: define, assign, filter | ✅ | ⬜ | `GET/POST/PATCH/DELETE /shop/v1/sections`, `PATCH .../sections` |
| 16.9 | Product **media** (primary image + gallery, private-S3 presigned) | ✅ | ⬜ | `POST .../media` + `.../media/register` + patch/delete |
| 16.10 | Inventory | "coming soon" | "coming soon" | — (a later slice) |
| 16.11 | Catalog product-analytics events (create/edit/archive/search/filter) | ✅ | ⏸ | PostHog |
| 16.12 | Shop isolation: every catalog query scoped to the operator's shop, never client input | ✅ | ✅ | `authorizeShopMember` (shop record) |

**Footnotes:**
- The mobile catalog repositories, use cases, draft store, schema client, section operations, and media
  registration calls remain in the codebase for a future presentation rebuild. They are not counted as
  operator-facing mobile capabilities while no route exposes them.
- **⏸ Row 16.11 (mobile telemetry):** deferred by design (documented Principle VII deviation, owned by
  the `mobile-telemetry` slice, consistent with 013/014).

**Historical 016 verification:** web — `pnpm typecheck` + `pnpm -r test` (back-office 35, shop-web 99)
and `turbo build` all green. Backend — edge-admin 52 (including catalog authz/service/handler), edge-shop
77 (including products authz/service/lifecycle/media). The mobile presentation tests recorded by 016
were retired with that presentation in 018; retained mobile catalog domain and repository tests remain.

## 018 — Shop mobile UI foundation reset

The mobile presentation has been intentionally reset. Authentication, session restoration/refusal,
record-backed Home and Account screens, the backend-authoritative manager gate, Light/Dark/System
appearance, and the responsive Home/Catalog/Orders/Account shell are delivered. Catalog and Orders now
show explicit foundation placeholders; the previous mobile catalog list, product detail, edit, and create
sheet are not reachable and their presentation code has been removed.

The catalog repository, use cases, device-local draft store, generated contracts, and backend remain
intact. Rows 16.1–16.9 are therefore marked outstanding for mobile until dedicated specifications rebuild
those user-facing workflows. Product creation must return as a recoverable full-screen flow, not a sheet.
