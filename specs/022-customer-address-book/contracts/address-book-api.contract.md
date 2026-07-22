# Contract: Address Book API (022)

**Path**: `edge-api/customer` (cold path — customer profile management, routing law 011 FR-028) ·
**Base**: `/customer/v1/addresses` · **Pool**: customer (gateway JWT authorizer) ·
**Errors**: RFC 9457 problem+json (edge-shared `problem`)

The address book **management CRUD moved to the cold path** (022). The endpoints are net-new on
`edge-api/customer` but the **DTOs are unchanged** (reused from 019). All routes are customer-scoped
from the authenticated subject — the caller's `sub` is resolved to the internal `customer.id` (and
gated on `active`, refusing a barred token) before any query; a customer only ever sees/acts on their
own addresses (FR-020, SC-005). Checkout still reads `public.customer_address` **directly via SQL** on
core-api for its order snapshot (that is checkout data access, not an address-book API).

DTOs (unchanged, in `packages/shared-types/src/address.ts`, generated to Kotlin):
`AddressDTO` · `CreateAddressRequest` · `UpdateAddressRequest`.

---

## `GET /customer/v1/addresses` — list (US1)

Returns the customer's addresses, default first (`ORDER BY is_default DESC, created_at ASC`).

**200**: `AddressDTO[]` — each with `id, label, recipientName, phone, line1, line2, city, region,
postalCode, country, isDefault`. Empty array → the client renders the empty state (FR-004).

---

## `POST /customer/v1/addresses` — add (US2)

**Request**: `CreateAddressRequest` — `recipientName, line1, city, postalCode` required; `label`
(free text; the client's chips write here), `phone`, `line2`, `region`, `country`, `makeDefault`
optional.

**Behaviour (unchanged, 019)**: the customer's **first** address is auto-defaulted; `makeDefault: true`
atomically clears the prior default (the CTE). **201** → the created `AddressDTO`.

**Errors**: `400` missing required fields (field-level).

---

## `PATCH /customer/v1/addresses/{id}` — edit **and** set-default (US3, US5)

One endpoint covers both. **Request**: `UpdateAddressRequest` (partial fields + `makeDefault`).
- Editing fields → updates them; default status unchanged unless `makeDefault` is sent.
- `makeDefault: true` → sets this the default, atomically clearing the prior one (idempotent if already
  default — FR-014).

**200** → updated `AddressDTO`. **404** not-found/not-owned. **400** invalid fields.

> Set-default is **already exactly-one-safe server-side** (the 019 CTE) — 022 adds nothing here.

---

## `DELETE /customer/v1/addresses/{id}` — delete, with the new default guard (US4) ⚠

The **one** endpoint 022 changes.

**Behaviour**:
- Deleting a **non-default** address → **204**.
- Deleting the **default while other addresses exist** → **409 conflict** (`ErrDefaultDeleteBlocked`),
  body advising the customer to set another address as default first (FR-016a, SC-010). Enforced
  server-side, so a racing device or a direct API call cannot bypass it.
- Deleting the **only** address (default or not) → **204** (nothing remains to be default).

**Errors**: `404` not-found/not-owned; `409` blocked default (distinct from 404 — the client maps 409 to
the reassign prompt, 404 to a benign "already gone").

**Guarantee**: deleting an address never alters any past order's recorded delivery address — an order
holds its own immutable jsonb snapshot, with no FK to `customer_address` (FR-016, SC-004).

---

## Client responsibilities (both surfaces, parity)

- **customer-web** — proxy routes under `app/api/addresses/` forward to **edge-api** via `proxyToEdge`
  (the ID token; the gateway authorizes it). ⚠ **No TanStack Query** — customer-web is the
  dependency-free storefront: the page fetches the initial list server-side (`edgeApi(session)`), and a
  `"use client"` list holds it in `useState`, calling the proxy fetchers (the FavoritesList pattern). The
  add/edit form mounts in a **`ResponsiveModal`** (Dialog ≥ breakpoint / Drawer below, R2). The row body
  opens edit; set-default and delete are distinct controls; delete of the default disables/redirects to
  reassign, and a server 409 is the backstop.
- **customer-mobile** — a `features/addresses/` slice (MVVM); the list is a `LazyColumn`, add via a **FAB
  → `ModalBottomSheet`** form; set-default/delete per row; row-tap edits; the 409 surfaces the reassign
  prompt.

Neither client sends a customer identity — it comes from the token (FR-020). Neither renders a card
layout — addresses are a list (R6, Principle V).
