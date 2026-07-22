# Feature Specification: Customer Address Book

**Feature Branch**: `022-customer-address-book`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "A dedicated place in the customer profile/account where a customer manages
MULTIPLE delivery addresses (not just at checkout). Today a customer_address table + address CRUD
already exist and are used at checkout with a one-off inline form; there is no standalone address-
management surface, no edit, no delete-from-profile, no clear default management. Make address
management a first-class account capability on BOTH customer surfaces at parity. Research good
address-book UX from Uber Eats and eBay. Web: a list with per-row set-default + delete, and an Add
button opening a responsive add-address form (dialog on large screens, drawer on small). Mobile: a list
with set-default + delete, and a floating action button to add that opens a bottom-sheet drawer form."

---

## Overview

Effy already **stores** customer addresses — the checkout flow lets a customer pick one, and there is a
one-off form to add one inline while paying. But there is nowhere to **manage** them. A customer cannot
review the addresses they've saved, correct a typo, remove one they no longer use, or deliberately choose
which address is their default — outside of the pressure of a checkout. The address that checkout
pre-selects is set implicitly and can't be changed on its own.

This slice gives the customer an **address book**: a first-class section of their account where saved
delivery addresses are listed and fully managed — add, set-default, delete (and edit, pending
clarification) — on **both** customer surfaces at parity. It is a management surface over an address
model that already exists; it turns a byproduct of checkout into an owned part of the profile.

### Why this is the right slice now

Address management is table stakes for any storefront, and it is currently a gap the customer only feels
as friction at checkout (a wrong address they can't fix without re-typing, a growing pile of one-off
addresses with no way to prune them). It is also a natural companion to 021's delivery pricing: a
customer who now sees different delivery options per address benefits from being able to curate those
addresses deliberately. And the backend already supports it end to end — this slice is about surfacing it
well, at parity, following the patterns Uber Eats and eBay have settled on.

---

## User Scenarios & Testing *(mandatory)*

> **Parity is mandatory.** Every story below ships on **both** customer surfaces — `apps/customer-web`
> and `apps/customer-mobile` — with equivalent capability, each feeling native to its platform. The
> customer parity register
> ([docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md)) MUST be
> updated in the same change. Reference platforms: the saved-address screens of **Uber Eats** (labelled
> addresses — Home / Work, one default, quick add) and **eBay** (an address list with edit/remove and a
> clearly marked default).

### User Story 1 - A customer sees all their saved addresses (Priority: P1)

A signed-in customer opens the address book in their account and sees every address they've saved, as a
clear list. The **default** address is unmistakably marked. Each address shows enough to recognise it
(its label if it has one, the recipient, and the address itself). When they have no saved addresses, the
screen invites them to add one rather than looking broken.

**Why this priority**: Seeing what you have is the foundation of managing it — every other action starts
here, and it is independently valuable.

**Independent Test**: With several saved addresses (one default), open the address book on each surface
and confirm all appear, the default is marked, each is legible, and the empty state shows when there are
none.

**Acceptance Scenarios**:

1. **Given** a customer with several saved addresses, **When** they open the address book, **Then** every
   address is listed, and the default is clearly marked as the default.
2. **Given** a customer with no saved addresses, **When** they open the address book, **Then** a clear
   empty state invites them to add their first address (not an error, not a blank screen).
3. **Given** the address book is open, **When** an address is displayed, **Then** it shows its label (if
   any), recipient, and the address lines legibly.
4. **Given** a customer who is not signed in, **When** they attempt to reach the address book, **Then**
   they are prompted to sign in (it is account-gated).

---

### User Story 2 - A customer adds a new address (Priority: P1)

From the address book, the customer adds a new delivery address through a focused form. The form captures
the address (recipient, the address lines, and an optional label). On success the new address appears in
the list immediately. The add experience is **responsive to the surface**: on the web it opens as a
dialog on larger screens and as a bottom drawer on smaller screens; on mobile it opens as a bottom-sheet
drawer raised by a floating action button.

**Why this priority**: Adding is the primary write action — a curated address book starts by being able
to fill it. It is required for the list to be more than read-only.

**Independent Test**: On each surface, open the add form (web: verify dialog on a wide viewport, drawer
on a narrow one; mobile: FAB → bottom sheet), enter a valid address, submit, and confirm it appears in
the list; submit an invalid/incomplete address and confirm a clear inline error without losing entered
data.

**Acceptance Scenarios**:

1. **Given** the address book, **When** the customer opens the add-address affordance, **Then** a focused
   address form appears in the surface-appropriate container (web: dialog on large / drawer on small;
   mobile: bottom-sheet drawer from the FAB).
2. **Given** the add form, **When** the customer submits a complete, valid address, **Then** it is saved
   and appears in the list without a full-page reload.
3. **Given** the add form, **When** the customer submits an incomplete or invalid address, **Then** a
   clear, field-level error is shown and the entered values are preserved.
4. **Given** the customer has **no** addresses yet, **When** they add their first one, **Then** it becomes
   the default automatically.
5. **Given** the label field, **When** the customer picks a label, **Then** they choose from Home / Work /
   Other chips, and choosing Other reveals a free-text field; a label may also be left unset.

---

### User Story 3 - A customer sets an address as default (Priority: P1)

The customer marks any saved address as their default directly from the list. Exactly **one** address is
the default at a time — setting a new default clears the previous one. The default is what checkout
pre-selects, so this is how a customer controls their everyday delivery destination without touching
checkout.

**Why this priority**: The default is the address book's most consequential setting — it silently drives
every future checkout — and today the customer cannot deliberately control it.

**Independent Test**: With two addresses, set the non-default one as default; confirm exactly one is
marked default (the other is cleared), the change persists, and a subsequent checkout pre-selects the new
default.

**Acceptance Scenarios**:

1. **Given** a non-default saved address, **When** the customer sets it as default, **Then** it becomes
   the default and the previously-default address is no longer the default.
2. **Given** the addresses after a default change, **When** the list is viewed, **Then** exactly one
   address is marked as the default.
3. **Given** a new default has been set, **When** the customer next reaches checkout, **Then** that
   address is the pre-selected delivery address.
4. **Given** the customer sets the already-default address as default again, **When** the action
   completes, **Then** nothing changes and no error is shown (idempotent).

---

### User Story 4 - A customer deletes an address (Priority: P1)

The customer removes an address they no longer need, directly from the list, with a confirmation so a
tap/click doesn't destroy an address by accident. Deleting an address the customer has previously ordered
to must not damage those historical orders (an order's delivery address is its own record).

**Why this priority**: Pruning is half of managing — without delete, the book only grows and becomes
useless. It is P1 with add/default.

**Independent Test**: Delete a non-default address (with confirmation) and confirm it leaves the list;
confirm a prior order that used that address still shows its address unchanged. Attempting to delete the
default while other addresses remain is blocked (prompt to reassign first); deleting the sole remaining
address is allowed.

**Acceptance Scenarios**:

1. **Given** a saved address, **When** the customer deletes it and confirms, **Then** it is removed from
   the list.
2. **Given** a delete action, **When** it is initiated, **Then** the customer is asked to confirm before
   the address is removed.
3. **Given** an address that a past order was delivered to, **When** that address is deleted, **Then** the
   historical order's recorded delivery address is unchanged.
4. **Given** the default address **and** other saved addresses, **When** the customer attempts to delete
   it, **Then** the delete is blocked and they are prompted to set another address as default first.
5. **Given** the default is the customer's **only** address, **When** they delete it, **Then** it is
   allowed (nothing is left to be default) and they return to the empty state.

---

### User Story 5 - A customer edits an existing address (Priority: P2)

The customer corrects or updates a saved address (a typo, a new unit number, a changed label) through the
same focused, surface-appropriate form used for adding, pre-filled with the current values. **Edit ships
in this slice** (clarified) — the address book is complete: view, add, edit, set-default, delete.

**Why this priority**: Editing is expected of any address book, and the backend already supports it — but
add/default/delete deliver a usable book on their own, so edit ranks just behind them.

**Independent Test**: Open an existing address for edit, change a field, save, and confirm the list
reflects the change and its default status is unaffected.

**Acceptance Scenarios**:

1. **Given** a saved address, **When** the customer activates the address row body, **Then** the form
   appears pre-filled with its current values in the surface-appropriate container (and the set-default /
   delete controls do not open the editor).
2. **Given** an edit, **When** the customer saves valid changes, **Then** the address is updated in the
   list, and its default status is unchanged unless they explicitly changed it.
3. **Given** an edit, **When** the customer submits invalid values, **Then** a field-level error is shown
   and their entries are preserved.

---

### Edge Cases

- **No addresses** → an inviting empty state, not an error.
- **Deleting the default while other addresses remain** → blocked; the customer must set a new default
  first. Deleting the default when it is the **only** address is allowed (→ empty state).
- **Deleting the last remaining address** → allowed; the customer returns to the empty state and will be
  prompted to add one at their next checkout.
- **A past order used a now-deleted address** → the order's snapshot is untouched (a placed order's
  address is immutable, per the existing model).
- **Concurrent edits from two devices** → last write wins on a field basis; the default remains singular.
- **An unserviceable address** (021 delivery zones) → it can still be **saved and managed** here;
  serviceability is a checkout-time concern, not an address-book concern (out of scope).
- **Very long address list** → remains legible and scrollable; no action is hidden.
- **Interrupted add/edit** (dismiss the dialog/drawer/sheet mid-entry) → nothing is saved; reopening
  starts fresh (add) or from the stored values (edit).
- **Backend unreachable** → the list and actions degrade to a clear, retryable state; never a false
  "no addresses" and never a silent failed save.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Viewing (US1)

- **FR-001**: A signed-in customer MUST be able to view all of their saved addresses as a list in their
  account.
- **FR-002**: The list MUST clearly mark which address is the default.
- **FR-003**: Each address MUST display its label (if set), recipient, and address lines legibly.
- **FR-004**: The list MUST show a clear empty state (inviting a first add) when the customer has no
  saved addresses.
- **FR-005**: The address book MUST be account-gated — an unauthenticated visitor is prompted to sign in.

#### Adding (US2)

- **FR-006**: A customer MUST be able to add a new delivery address (recipient, address lines, optional
  label, optional phone) from the address book.
- **FR-006a**: The label MUST be chosen from **preset chips (Home / Work / Other)**, where **Other**
  reveals a free-text field; the chosen value is stored in the existing free-text label. A label may be
  left unset.
- **FR-007**: The add form MUST appear in the **surface-appropriate responsive container** — on web a
  dialog on larger screens and a drawer on smaller screens; on mobile a bottom-sheet drawer raised by a
  floating action button.
- **FR-008**: A newly added address MUST appear in the list immediately, without a full reload.
- **FR-009**: Invalid or incomplete submissions MUST produce clear field-level errors and MUST preserve
  the customer's entered values.
- **FR-010**: The customer's **first** address MUST automatically become the default.

#### Default (US3)

- **FR-011**: A customer MUST be able to set any saved address as the default, from the list.
- **FR-012**: At most **one** address is the default at any time — setting a new default clears the prior
  one.
- **FR-013**: The default address MUST be the one checkout pre-selects.
- **FR-014**: Setting the already-default address as default MUST be a harmless no-op.

#### Deleting (US4)

- **FR-015**: A customer MUST be able to delete a saved address from the list, behind a confirmation.
- **FR-016**: Deleting an address MUST NOT alter the recorded delivery address of any past order.
- **FR-016a**: Deleting the **default** address MUST be blocked, **server-side**, while the customer has
  other saved addresses — the delete endpoint refuses it (a conflict), so the invariant holds against a
  racing device or a direct API call, not only the UI. The client also guards it for UX (disable /
  prompt to reassign first). Deleting the default when it is the **only** address MUST be allowed
  (nothing remains to be default).

#### Editing (US5)

- **FR-017**: A customer MUST be able to edit a saved address through the same responsive form,
  pre-filled with its current values; a valid save updates the address without changing its default
  status unless the customer explicitly changes it.
- **FR-017a**: Editing MUST be opened by activating the **address row body** (tap/click); the per-row
  **set-default** and **delete** controls remain distinct and MUST NOT trigger edit.

#### Cross-cutting

- **FR-018**: Every capability MUST be delivered on **both** customer surfaces at parity, each native to
  its platform, and MUST reuse the shared address data contract (no per-surface redefinition).
- **FR-019**: All address actions MUST be observable (product analytics + structured logs) with no PII
  beyond the authenticated subject id in telemetry (an address is PII and MUST NOT appear in analytics
  properties).
- **FR-020**: A customer MUST only ever see and manage **their own** addresses — enforced server-side,
  never by client-supplied identity.

### Key Entities *(include if data involved)*

- **Delivery address (existing)**: a customer's saved address — recipient, address lines, optional label
  and phone, a country, and a default flag. Owned by exactly one customer; exactly one of a customer's
  addresses is the default. This model already exists; this slice manages it, it does not redefine it.
- **Customer (existing)**: the owner; addresses are scoped to the authenticated customer.
- **Order delivery snapshot (existing, read-only here)**: a placed order's own immutable copy of the
  address it went to — which is why deleting a saved address never disturbs history.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A customer can add a new address and see it in their list in **under 30 seconds**, on both
  surfaces.
- **SC-002**: After setting a new default, a subsequent checkout pre-selects it in **100%** of cases.
- **SC-003**: Exactly **one** address is the default at all times — **zero** states with two defaults or
  (while addresses exist and the clarification requires one) no default.
- **SC-004**: Deleting an address leaves **100%** of that customer's past orders' recorded addresses
  unchanged.
- **SC-005**: A customer sees and can act on **only** their own addresses — **zero** cross-customer
  visibility, verified adversarially.
- **SC-006**: The add form presents in the correct responsive container in **100%** of cases (web: dialog
  ≥ the breakpoint, drawer below it; mobile: bottom sheet from the FAB).
- **SC-007**: Every capability is demonstrably satisfied on **both** `customer-web` and
  `customer-mobile`, verified against its acceptance scenarios on each.
- **SC-008**: **Zero** address PII (any address field) appears in product-analytics properties.
- **SC-009**: An interrupted add/edit (dismissed mid-entry) saves **nothing** — **zero** partial
  addresses created.
- **SC-010**: A customer can never delete their default while other addresses exist — **100%** of such
  attempts are blocked (including a direct API call, not just the UI), and **zero** customers with saved
  addresses end up with no default.
- **SC-011**: The full CRUD — view, add, **edit**, set-default, delete — is demonstrable on **both**
  surfaces (edit included in this slice).

---

## Clarifications

### Session 2026-07-22 (b)

- Q: **How does the customer open an address for editing?** Set-default and delete are per-row actions;
  the edit entry point was unspecified. → **A: TAP/CLICK THE ROW BODY.** The address row itself is the
  edit affordance (opens the pre-filled form in the surface-appropriate container); **set-default** and
  **delete** remain distinct per-row controls. Matches Uber Eats/eBay, keeps the row to two explicit
  controls, and gives a large forgiving touch target on mobile.
- Q: **Where is the delete-default block enforced — server or client?** The set-default invariant is
  already server-enforced (019's CTE atomically clears the prior default), but the 019 DELETE endpoint has
  no default protection. → **A: SERVER-ENFORCED.** The address-delete endpoint MUST refuse to remove the
  default while other addresses exist (a conflict), so the invariant holds against a racing device or a
  direct API call — not only the UI. The client also guards for UX (disable/redirect), but the server is
  authoritative. **This makes 022 mostly — not purely — frontend** (a small guard on the existing delete).
  Deleting the sole remaining address stays allowed.

### Session 2026-07-22

- Q: **Does editing an existing address ship in this slice, or is it deferred?** → **A: Edit ships NOW.**
  The slice delivers the complete address book — view, add, **edit**, set-default, delete — on both
  surfaces. The backend PATCH already exists, so edit is one more open-the-form path over an existing
  endpoint. US5 (FR-017) is therefore a full P-story, not a maybe.
- Q: **What happens when the customer deletes their current default (and other addresses remain)?** →
  **A: BLOCK the delete until a new default is chosen.** A customer with other addresses cannot delete
  the current default directly; the surface must prompt them to set another address as default first
  (or offer to, inline). This keeps "exactly one default while addresses exist" true by construction and
  makes the consequential choice explicit rather than implicit. Deleting the **last** address (nothing
  left to be default) is still allowed → empty state.
- Q: **How is an address's label chosen — free text, or preset chips?** → **A: PRESET CHIPS (Home / Work
  / Other), Uber Eats pattern.** The form offers Home / Work / Other chips; choosing **Other** reveals a
  free-text field. The chosen value is stored in the **existing free-text `label`** — no data-model
  change (Home/Work are just the common presets; Other passes through arbitrary text). A label remains
  optional.

---

## Assumptions

Recorded as reasonable defaults so the spec is buildable; each can be overridden in `/speckit-clarify`.

- **The backend already exists.** A `customer_address` model and full address CRUD (list / add / update /
  delete, including a default flag and a label) already ship (019) and are used at checkout. This slice
  is overwhelmingly a **client/surface** feature: it exposes and manages that model well, at parity. No
  new address data model is introduced.
- **Account-gated, signed-in only.** The address book is part of the customer's account; guests are
  prompted to sign in. This does not change the storefront's guest-first browsing.
- **Serviceability is not an address-book concern.** An address can be saved and managed regardless of
  whether Effy currently delivers to it — 021 checks serviceability at checkout, not here.
- **The label is optional.** An address without a label is valid and displays by its address lines.
- **A soft cap on saved addresses** (an industry-standard limit, e.g. a couple of dozen) is acceptable to
  prevent abuse; the exact number is a tuning value, not a spec constant.
- **Single country / format (AU).** Address fields follow the existing AU-shaped model (recipient, two
  lines, city, region, postcode, country); international address formats are out of scope.
- **Phone is optional** on an address (the existing model allows it).

## Dependencies

- **019 customer commerce flow** (signed off) — supplies the `customer_address` model, the address CRUD
  endpoints this surfaces, and the checkout default-selection this feeds.
- **011 / 012 customer web + profile** — the account/profile shell this address book lives inside, and
  the customer-pool authentication that gates it.
- **013 / 015 customer mobile** — the KMP surface, its navigation shell, and account section this extends.
- The shared address data contract both surfaces already consume.
- ⚠ **Path note for the plan**: the existing address CRUD lives on the **hot path** (`core-api`,
  `/v1/addresses`) because it was built alongside checkout, whereas the routing doctrine would put
  "customer profile" on the cold path. Reusing the existing hot-path endpoints (no move) is almost
  certainly right — moving them would be churn for no benefit — but the plan MUST record the decision
  explicitly (Principle III).

## Out of Scope

- Any new address **backend** (the CRUD exists) — beyond small additions the clarifications might imply.
- Address **validation/autocomplete** against a postal/geocoding service, and serviceability checks
  (021 owns serviceability, at checkout).
- International address formats or multi-country support.
- Address **sharing** between customers, or non-delivery address types (billing, etc.).
- Map-pin / current-location capture.
- Changing how checkout **selects or snapshots** an address (this feature only sets which is default).
