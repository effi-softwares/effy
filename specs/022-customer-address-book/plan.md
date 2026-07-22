# Implementation Plan: Customer Address Book

**Branch**: `022-customer-address-book` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-customer-address-book/spec.md`

---

## Summary

Give the customer a first-class **address book** in their account — view, add, edit, set-default, delete
saved delivery addresses — on **both** customer surfaces at parity, over the address model that already
exists (019). It is **~85% client surface work**: the backend CRUD is done and set-default is already
exactly-one-safe; the only backend change is a small **server-side delete-default guard**. Web uses a
list with a responsive Dialog/Drawer add-edit form; mobile a list with a FAB → bottom-sheet form.

**Technical approach** — four moving parts, all extending proven patterns:

1. **Backend (one small change)** — a delete-default guard in the existing
   `apis/core-api/internal/features/addresses` (refuse deleting the default while others exist → 409).
2. **Design-system** — add the shadcn **Drawer** (vaul) + a `ResponsiveModal` wrapper (Dialog ≥ breakpoint
   / Drawer below, via the existing `useIsMobile`), so the responsive add/edit form is a shared primitive.
3. **customer-web** — a `features`/route slice under the `(account)` group: the address list, the
   responsive add/edit form, set-default/delete, row-body-opens-edit; TanStack Query + the existing
   `/api/addresses` proxy (extended for patch/delete).
4. **customer-mobile** — a `features/addresses/` slice (MVVM): the list, FAB → `ModalBottomSheet` form,
   set-default/delete, row-tap edit; reusing the generated address DTOs.

No migration, no new DTOs, no contract change beyond one new 409 the clients already map.

---

## Technical Context

**Language/Version**: Go 1.25 (one guard) · React 19 + TypeScript (customer-web + design-system) ·
Kotlin 2.4.0 + Compose Multiplatform 1.11.1 (customer-mobile).

**Primary Dependencies**: **One new library** — `vaul` (the shadcn Drawer's base), added to
`@effy/design-system` within the shadcn standard (R2). Otherwise existing: TanStack Query/Router,
`@effy/design-system/ui` (dialog/sheet/alert-dialog + `useIsMobile`), `@effy/api-client`; Compose
Material 3 (`FloatingActionButton`, `ModalBottomSheet`); Ktor + the generated `CommerceDto.kt`.

**Storage**: PostgreSQL 16 — `public.customer_address` (existing, 019). **No migration, no schema
change.**

**Testing**: `go test` (the delete guard) · Vitest + RTL (design-system Drawer/ResponsiveModal;
customer-web address book) · Kotlin `commonTest` (mobile ViewModel + fakes).

**Target Platform**: core-api (local Docker) · modern browsers · Android + iOS.

**Performance Goals**: address reads/writes are small, indexed, low-frequency — no new latency concern;
the reused endpoints are already fine where they are.

**Constraints**: exactly-one-default (already server-safe); delete-default blocked **server-side**
(FR-016a, SC-010); a customer sees/acts on **only** their own addresses (FR-020); **no card layouts**
(Principle V — a list); no address PII in analytics (SC-008); the responsive add/edit container
(SC-006).

**Scale/Scope**: dev-scale. Net change: 1 backend guard, 1 design-system component + wrapper, 2 client
feature slices. No migration.

---

## Path Assignment (Principle III — mandatory declaration)

> **Path: `edge-api/customer` (cold).** The address book is **customer profile management**, and the
> routing law (011 FR-028) puts customer profile/account on the **cold path** — `edge-api/customer`,
> the same service that already owns `/customer/v1/me`, password, and sessions. The management CRUD is
> low-frequency account traffic, exactly what cheap serverless is for. **New routes**:
> `GET/POST /customer/v1/addresses`, `PATCH/DELETE /customer/v1/addresses/{id}`, customer authorizer.
>
> ⚠ **Correction (post-implementation).** The CRUD was originally built on the **hot path** in 019
> (alongside checkout) and 022 first reused it there under a recorded Principle-III *exception*. That
> exception was wrong — it overrode the standing rule (profile → cold path) without authority. 022 now
> **moves** the management CRUD to `edge-api/customer` and **removes** it from core-api. Checkout keeps
> reading `public.customer_address` **directly via SQL** for its order snapshot — that is checkout data
> access on the hot path, not an address-book API, so nothing is "split". Recorded per
> [docs/api/path-assignment.md](../../docs/api/path-assignment.md).

---

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| **I. Spec-Driven** | ✅ PASS | spec (23 FR / 11 SC / 5 clarifications, 0 markers) → this plan → tasks next. |
| **II. Monorepo & Shared Contracts** | ✅ PASS | Reuses the existing `AddressDTO`/requests (generated to Kotlin); the responsive modal + Drawer are added to the shared design-system (one place), not per-surface. No DTO redefinition. |
| **III. Dual-Path Discipline** | ✅ PASS | Address management is customer profile → **cold path** (`edge-api/customer`), per the routing law (011 FR-028). No exception needed; the earlier hot-path reuse was corrected (moved to cold, removed from core-api). |
| **IV. Auth Isolation** | ✅ PASS | Customer pool, existing `customeridentity`; every query customer-scoped from the subject, never client input. |
| **V. Native-Feel, Consistent Design** | ✅ PASS | A **list**, not cards (R6). Responsive add/edit (Dialog/Drawer web, bottom sheet mobile) — the operator's spec. Fat-finger targets (row-tap edit; FAB). Dark mode + tokens from the design-system. |
| **VI. Layered Architecture** | ✅ PASS | Backend service guard over raw SQL; web server-state cache (TanStack Query) — no hand-cached server data; mobile MVVM (immutable UiState). No DI framework. |
| **VII. Observability & Telemetry** | ✅ PASS | Declared below. |

**Result: PASS — one recorded Principle-III exception (reuse-in-place) and one within-standards library
addition (vaul), both in Complexity Tracking. No unjustified violations.**

### Telemetry declaration (Principle VII)

- **Product events (PostHog, customer-web)**: `address_added`, `address_edited`, `address_deleted`,
  `address_default_set`, `address_delete_default_blocked` — **no address fields** (address is PII),
  subject id only. Mobile telemetry deferred (013/014/015/020/021 pattern), recorded not skipped.
- **Metrics/logs**: the backend guard rides core-api's existing RED middleware; structured logs never log
  an address.

---

## Project Structure

### Documentation (this feature)

```text
specs/022-customer-address-book/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/address-book-api.contract.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
apis/edge-api/customer/src/addresses/                # COLD PATH — the address book management CRUD (022)
├── model.ts                                          # AddressRow + toDTO
├── repo.ts                                            # raw SQL: list/create/update/delete + delete-default guard CTE
├── service.ts                                         # resolve sub→customer.id (+ barred gate) + sentinels
├── http.ts                                            # body→input mapping + shared error envelope (incl. 409)
└── service.test.ts                                    # access decision, validation, guard outcomes (10 tests)
apis/edge-api/customer/src/functions/                 # 4 Lambdas: addresses GET/POST + {id} PATCH/DELETE
apis/edge-api/customer/serverless.yml                 # MODIFIED — 4 routes, customer authorizer
apis/edge-api/shared/src/lib/http.ts                  # MODIFIED — ProblemType.Conflict (the 409 vocabulary)
apis/core-api/internal/features/addresses/            # REMOVED — moved to the cold path (checkout keeps its
                                                      #   direct customer_address SQL read for the snapshot)

packages/design-system/src/
├── ui/drawer.tsx                                     # NEW — shadcn Drawer (vaul)
├── ui/responsive-modal.tsx                           # NEW — Dialog ≥ breakpoint / Drawer below (useIsMobile)
└── (package.json)                                    # MODIFIED — + vaul dependency

apps/customer-web/
├── app/(account)/addresses/page.tsx                  # NEW — the address book page (account-gated via requireCustomer)
├── app/(account)/addresses/_components/               # NEW
│   ├── AddressList.tsx  AddressRow.tsx  AddressFormModal.tsx (ResponsiveModal + form)  DeleteAddressDialog.tsx
├── lib/addresses/ (repo.ts, queries.ts, model.ts)    # NEW — TanStack Query over /api/addresses
├── app/api/addresses/route.ts                        # EXISTS (list/create) — reused
└── app/api/addresses/[id]/route.ts                   # NEW — patch/delete proxy

apps/customer-mobile/shared/src/commonMain/.../features/addresses/   # NEW slice (MVVM)
├── domain/{AddressBook,AddressRepository,AddressUseCases}.kt
├── data/{HttpAddressRepository,AddressMappers}.kt
└── presentation/{AddressBookViewModel,AddressBookScreen}.kt  (LazyColumn + FAB + ModalBottomSheet form)
apps/customer-mobile/.../features/account/… + nav                    # MODIFIED — reach the address book from Account

docs/audiences/customer-capabilities.md               # MODIFIED — §022 parity rows
```

**Structure Decision**: no new organising idea. The backend change is one guard in the existing slice.
The design-system gains one shared component + a wrapper. Each client adds a small feature slice in its
surface's idiom (web: `(account)` route + TanStack Query + `/api` proxy; mobile: MVVM feature reached
from the Account tab). The address DTOs and set-default behaviour are reused as-is.

---

## Design Notes (Phase 1 outcomes)

**The backend is almost entirely done** (R1/R3). Set-default is already exactly-one-safe (019's CTE); the
only change is the delete-default guard — a single guarded `DELETE` statement plus a 404-vs-409
disambiguation and a new sentinel error. Everything else is view/add/edit/set-default, which the existing
endpoints already serve.

**One shared responsive primitive** (R2). Rather than each surface hand-rolling the dialog-vs-drawer
switch, the design-system gets a `ResponsiveModal` (Dialog ≥ breakpoint / Drawer below via `useIsMobile`)
plus the shadcn `Drawer`. `vaul` is the shadcn Drawer's base — a within-standards library addition
(recorded), not a stack swap.

**Chips are presentation** (R5). Home/Work/Other write the existing free-text `label`; on read, `Home`/
`Work` re-select the chip, anything else selects Other + text. No schema or DTO change.

**A list, never cards** (R6, Principle V) — the operator's "simple list", and addresses are inherently a
list.

**Checkout's inline form is left alone** (R8) — reconciling it to the new richer shared form is
out of scope, to keep the slice tight.

---

## Complexity Tracking

One item recorded (not an unjustified violation):

| Item | Why | Justification |
|---|---|---|
| **New library: `vaul`** (the shadcn Drawer base) | The responsive add/edit needs a mobile-web drawer with the drag-dismiss feel the operator linked | `vaul` is the library shadcn's own Drawer is built on — a within-standards addition, not a stack swap (the standard is "shadcn/ui"). No constitution amendment. Fallback (compose from the existing Radix Sheet, zero deps) recorded in R2. |

**Corrected (not an exception):** an earlier draft kept the address CRUD on the hot path under a
Principle-III exception. That was wrong — customer profile management is cold-path by the routing law.
022 moved the CRUD to `edge-api/customer` and removed it from core-api; there is no exception to track.

**Also (React pin):** adding `vaul` re-resolved the floating `^19` React ranges up to 19.2.7 while
customer-web hard-pins 19.2.4, splitting React under test. Fixed with a root `pnpm.overrides` pinning
`react`/`react-dom` to `19.2.4`.

No migration. No new DTOs. The standing **mobile-telemetry deferral** (Principle VII) is inherited and
declared above.
