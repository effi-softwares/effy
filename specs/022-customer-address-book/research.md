# Research: Customer Address Book (022)

**Date**: 2026-07-22 · **Feeds**: [plan.md](./plan.md) · **Spec**: [spec.md](./spec.md)

Phase 0 decisions. This is a small, mostly-frontend slice over an existing backend, so the research is
grounding (verified in code) rather than open exploration. Each records the decision, why, and what was
rejected. ⚠ marks a finding that changes an assumption.

---

## R1 — Path: reuse the existing **hot-path** `/v1/addresses` in place; add one small guard ⚠

**Decision**: The address book is served by the **existing** `apis/core-api/internal/features/addresses`
slice (`GET/POST/PATCH/DELETE /v1/addresses`) — **no move, no new endpoints** for view/add/edit/set-
default. The one backend change is a **guard on `DELETE`** (R3). The delete guard rides the same slice.

**⚠ The doctrine would say cold path; reuse-in-place is right anyway.** `docs/api/path-assignment.md`
rule 2 puts "customer profile" on the cold path, but this CRUD already lives on core-api because it was
built alongside checkout (019). Moving it to `edge-api/customer` would be pure churn — it would split one
address model across two services, break the checkout reads that already use it, and change nothing for
the customer. The endpoints are latency-fine where they are. **Principle III exception recorded**: the
address CRUD stays on the hot path by *inheritance from 019*, not because it is latency-critical — a
justified deviation logged here and in [plan.md](./plan.md).

**Rejected**: *move to cold path for doctrinal purity* (churn, dual-ownership, breaks checkout); *new
address endpoints* (the CRUD is complete — verified).

---

## R2 — Responsive add/edit container: add the shadcn **Drawer** + a `ResponsiveModal` wrapper

**Decision**: Add the shadcn **`drawer`** primitive (vaul) to `@effy/design-system/ui`, and a small
`ResponsiveModal` wrapper that renders a **Dialog** at/above a breakpoint and a **Drawer** below it, via
the existing `useIsMobile` hook. The address form mounts inside it — dialog on desktop web, bottom drawer
on mobile web — exactly the shadcn responsive pattern the operator linked.

**Rationale**: the design-system already ships `dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx`, and
`hooks/use-mobile` (`useIsMobile`), but **no `drawer`**. The operator explicitly referenced the shadcn
responsive **Drawer** (vaul) — its drag-to-dismiss grabber is the mobile-web feel they want. `vaul` is
the library shadcn's own Drawer is built on, so this is a within-standards **library addition** (a plan
MAY add a library within the locked stack), not a stack swap — recorded in Complexity Tracking, no
constitution amendment. It lives in the design-system (Principle II: one place), so every surface shares
it.

**Rejected**: *compose the mobile case from the existing Radix `sheet` (side="bottom")* — functionally a
bottom drawer and adds zero dependency, but loses the grabber/scaled-background feel the operator's linked
component provides; kept as the fallback if we later want to drop vaul. *Dialog-only on all sizes* —
contradicts the explicit responsive requirement (SC-006).

---

## R3 — Delete-default guard: **server-enforced** in the existing Delete service (from `/clarify`)

**Decision**: `addresses.Service.Delete` gains a guard: if the target is the customer's **default** AND
they have **other** addresses, refuse with a conflict; otherwise delete. Deleting the sole remaining
address (default or not) is allowed. The web/mobile clients also guard for UX, but the server is the
authority.

**⚠ Grounded in the actual code.** Set-default is **already** atomic and server-safe — 019's create/update
use a CTE that clears every other default and auto-defaults the first address, so "exactly one default"
holds server-side today. But `Delete` is `DELETE ... WHERE id=$1 AND customer_id=$2` with **no** default
protection — a delete of the default silently leaves the customer defaultless-with-addresses. The clarify
answer makes the block a hard invariant, so it belongs where set-default already lives: the server.

**Mechanism**: a single guarded statement (or a read-then-conditional-delete in one tx) —
`DELETE … WHERE id=$1 AND customer_id=$2 AND NOT (is_default AND (SELECT count(*) FROM customer_address
WHERE customer_id=$2) > 1)`; zero rows affected on a blocked default → map to a **409 conflict**
distinct from not-found. A new sentinel error (`ErrDefaultDeleteBlocked`) → 409.

**Rejected**: *client-only guard* (a racing device or direct API call violates SC-010); *auto-promote
another default on delete* (Q2 chose block-not-promote; auto-promote makes the choice implicit).

---

## R4 — Mobile: a `features/addresses/` slice; FAB → Material 3 `ModalBottomSheet`

**Decision**: A new `apps/customer-mobile` `features/addresses/` slice (Clean-Arch + MVVM, mirroring the
existing `features/account`), reached from the **Account** tab. The list is a `LazyColumn` of address
rows (tap-row → edit); a **`FloatingActionButton`** raises a **`ModalBottomSheet`** (Compose Material 3)
holding the address form; set-default and delete are per-row controls; delete-default shows the reassign
prompt.

**Rationale**: the mobile app already has `features/account/` (domain/data/presentation) and a generated
address DTO set in `CommerceDto.kt` (verified: `AddressDTO`, `CreateAddressRequest`, `UpdateAddressRequest`
all present). `ModalBottomSheet` + `FAB` are stock Material 3 — no new dependency — and match the
operator's spec. The existing `AddressRepository` (checkout) is reused/extended for the CRUD.

**Rejected**: a full-screen add route (the operator specified a bottom sheet); a new address DTO
(generated ones exist).

---

## R5 — Contracts: reuse the existing address DTOs; one new error shape only

**Decision**: **No new address DTOs.** `AddressDTO`, `CreateAddressRequest` (with `label`, `phone`,
`makeDefault`), and `UpdateAddressRequest` (with `makeDefault`) already exist in
`packages/shared-types/src/address.ts` and are generated to Kotlin. The label **chips** (Home/Work/Other)
are a **UI concern** that writes the existing free-text `label` — no contract change. The only addition is
recognising the delete-default **409** on the client (the `@effy/api-client` / mobile error mapping already
has a conflict path from 020/021).

**Rationale**: Principle II is satisfied by reuse; the clarify answers (chips map to free text, no schema
change) mean the wire contract is untouched save for one error code the clients already handle.

**Rejected**: new DTOs for a "label kind" enum (chips are presentation; the stored value stays free text).

---

## R6 — Layout: a **list**, not cards (Principle V), on both surfaces

**Decision**: The address book is a **list of address rows** — the operator said "simple list", and
Principle V prohibits card layouts. Each row: label (if set) + recipient + address lines, a default
marker, and the set-default / delete controls; the row body opens edit (FR-017a). Empty state invites a
first add. Web uses list rows (not tiled cards); mobile a `LazyColumn`.

**Rationale**: directly the operator's instruction and the constitution's no-card doctrine. Addresses are
inherently a list, which is what lists are for. **No card justification is claimed.**

---

## R7 — Telemetry: address events, zero address PII (Principle VII)

**Decision**: PostHog events `address_added`, `address_edited`, `address_deleted`,
`address_default_set`, `address_delete_default_blocked` — carrying **no address fields** (an address is
PII), subject id only. Web emits now; mobile telemetry stays deferred (013/014/015/020/021 pattern),
recorded not skipped. Structured logs on the backend guard never log an address.

**Rationale**: Principle VII; and SC-008 makes "zero address PII in analytics" an explicit criterion.

---

## R8 — Reuse vs. reconcile the existing checkout `AddressForm`

**Decision**: Build the address-book form as the **richer, shared** form (label chips, optional phone,
default toggle) and use it in the address book. The existing minimal checkout `AddressForm` (posts
`makeDefault:true`, no label/phone) is **left as-is** for now — reconciling checkout to the shared form
is a nice-to-have, explicitly out of scope, to keep this slice tight.

**Rationale**: parity + DRY favour a shared form, but refactoring the checkout inline-add is scope creep
with its own test surface. The address book gets the good form; checkout keeps working unchanged.

**Rejected**: *refactor checkout to reuse the new form now* (scope creep); *duplicate the minimal form*
(the address book needs the richer form regardless).
