# Feature Specification: Customer Saved Items — Watchlist, Guest Saving & Zone-Aware Purchasability

**Feature Branch**: `033-customer-saved-items`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "Customer Saved Items — a price-and-availability watchlist for the
customer audience, replacing the existing half-built favourites capability entirely."

---

## Context: why this is a replacement, not an improvement

A "favourites" capability already exists for the customer audience. It is not unbuilt — it is
**built wrong**, in ways that make a shopper trust it and then be misled:

1. **The heart lies.** Nothing on the platform can answer "is this product already saved?" for a
   given product. Every surface therefore assumes *not saved* every time a product is opened. A
   shopper who saved a product yesterday opens it today, sees an empty heart, taps it (nothing
   happens), taps again — and **silently un-saves the thing they were trying to save**. The saved
   list is the only place the truth is visible.
2. **Purchasability lies too.** The list calls a product available whenever the catalogue says the
   product is active. But fulfilment is hidden and delivery is scoped by area, so a product can be
   perfectly active and **still not purchasable at the shopper's address**. The list invites the
   shopper in and checkout stops them — the same failure class the delivery-areas work exists to
   prevent, reappearing on a new surface.
3. **It is effectively hidden on the web storefront.** The saved-items page is linked from exactly
   one place — the storefront footer. The account navigation does not list it at all.
4. **Nothing is tested.** There is no automated coverage of saving, un-saving, listing, or merging
   on any surface.

This feature **removes that capability entirely** — its behaviour, its stored data, and every trace
of it across the customer surfaces — and rebuilds it from a decided product model. Nothing about
the previous design is assumed to carry forward.

## Context: what "saved items" means here

**Saved items is a WATCHLIST, not a wishlist.** Two structurally different things share the word
"favourites" in this market, and this feature is deliberately only one of them:

| Model | What populates it | Answers |
|---|---|---|
| **Watchlist** (this feature) | The shopper explicitly saving a product | "Is this worth acting on yet?" |
| **Repeat-purchase list** (a reserved sibling — **Buy It Again**) | Derived from what the shopper has actually bought | "Get me to my usuals in one tap" |

The value proposition of the watchlist is: **save the things you care about, and we will show you
when they are worth acting on** — it went on special, it came back in stock, it is no longer
delivered to your area, it is no longer sold.

**Buy It Again is named here as a reserved sibling capability** so that a later feature does not
have to rename this one. It is derived from order history and ranked by how often and how recently
a shopper bought something. **This feature does not model it, build it, or place it.**

The capability is called **Saved items** in every piece of shopper-facing language, and the
affordance is a **heart**. The word "wishlist" MUST NOT appear anywhere shopper-facing — shoppers
read it as a gift-registry and report feeling self-indulgent using it.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save a product and have it stay saved (Priority: P1)

A signed-in shopper finds a product they care about and saves it with one tap. Everywhere that
product appears afterwards — the product page, a tile in browse or search, a rail on the home
screen, a line in their order history — it is shown as saved, **without the shopper touching it
first**. Tapping again un-saves it, and that also holds everywhere. The shopper can open a Saved
items list and see exactly what they saved, newest first.

**Why this priority**: This is the entire foundation, and it is the specific thing that is broken
today. A saved-items feature whose control does not reflect reality is worse than none, because it
destroys a save the shopper was trying to make. Without this story nothing else in the feature can
be trusted; with only this story, the shopper already has a working, honest saved list.

**Independent Test**: Save a product on one surface, fully close and reopen the app or reload the
page, navigate to that product by a different route, and confirm the control shows *saved* on first
render. Then un-save it and confirm the same across surfaces. Deliverable value: a saved list that
is correct.

**Acceptance Scenarios**:

1. **Given** a signed-in shopper viewing a product they have never saved, **When** they activate the
   save control, **Then** the control immediately shows *saved*, and the product appears at the top
   of their Saved items list.
2. **Given** a shopper who saved a product in a previous session, **When** they open that product's
   detail page from any entry point, **Then** the control shows *saved* on first render without any
   interaction.
3. **Given** a shopper viewing a grid or rail containing a mix of saved and unsaved products,
   **When** the products first render, **Then** each product's control reflects that product's real
   saved state.
4. **Given** a shopper viewing a saved product, **When** they activate the save control twice in
   rapid succession, **Then** the end state is *not saved*, and no duplicate or orphaned entry
   exists.
5. **Given** a shopper activating the save control, **When** the platform cannot record the change,
   **Then** the control returns to its previous state and the shopper is told the save did not
   stick.
6. **Given** a shopper who saves the same product from two different devices, **When** they view
   their Saved items list on either device, **Then** the product appears exactly once.
7. **Given** a shopper on their Saved items list, **When** they remove an item, **Then** the item
   disappears immediately and an undo affordance is offered; **When** they undo, **Then** the item
   returns **to the position it previously occupied**, not to the top of the list.

---

### User Story 2 - Know what changed since I saved it (Priority: P2)

A shopper opens Saved items to decide what to buy. For each saved product the list tells them
plainly whether they can buy it right now **at the address they are shopping for**, and whether its
price has moved since they saved it. A product whose price has fallen is called out. A product they
cannot buy says *which* of the reasons applies, because the reasons imply different actions.

**Why this priority**: This is what makes the list a watchlist rather than a bookmark folder, and it
is the second defect being fixed — the list currently claims products are available when they are
not purchasable at the shopper's address, walking them into a checkout refusal. It depends on US1
existing but is independently testable and deployable on top of it.

**Independent Test**: Save products in each condition — purchasable, out of stock, sold but not
delivered to the shopper's area, withdrawn from sale — and confirm the list distinguishes all four
in shopper-readable language. Separately, change a saved product's price downward and confirm the
list surfaces the drop. Deliverable value: a shopper can act on the list without being misled.

**Acceptance Scenarios**:

1. **Given** a shopper with a delivery location set and a saved product that can be delivered to it,
   **When** they open Saved items, **Then** the product is shown as purchasable and can be added to
   the cart.
2. **Given** a saved product that is sold but temporarily unavailable, **When** the shopper opens
   Saved items, **Then** it is shown as temporarily out of stock and is **not** presented as
   addable.
3. **Given** a saved product that is sold, in stock, but not deliverable to the shopper's current
   location, **When** the shopper opens Saved items, **Then** it says it is **not delivered to their
   area** — distinctly from "out of stock" — and the shopper is offered a way to change their
   delivery location.
4. **Given** a saved product that has been withdrawn from sale entirely, **When** the shopper opens
   Saved items, **Then** the entry **remains in the list**, is marked as no longer sold, and is not
   presented as addable. It MUST NOT silently disappear.
5. **Given** a shopper with no delivery location set, **When** they open Saved items, **Then**
   purchasability is presented as **not yet determined** — never as available — and the shopper is
   prompted to say where they live.
6. **Given** a shopper viewing Saved items, **When** they change their delivery location, **Then**
   purchasability is re-decided for every item in the list and the displayed reasons update.
7. **Given** a product whose price is lower now than when the shopper saved it, **When** they open
   Saved items, **Then** the current price is shown together with an indication that it has fallen
   and what it was when saved.
8. **Given** a product whose price is unchanged or higher than when saved, **When** the shopper opens
   Saved items, **Then** the current price is shown plainly with no change indicator.

---

### User Story 3 - Save without an account, and keep them when I sign in (Priority: P2)

A shopper who is not signed in taps the heart. It works. Their saves are held on that device and
behave exactly like a signed-in shopper's list — visible, removable, and reflected on every product
control. When they later sign in or register, those saves **join** their account's saved items, and
they are told it happened.

**Why this priority**: The storefront is guest-first, and throwing a shopper to a sign-in page the
moment they express interest is the single most documented reason saved-item features go unused.
This is a deliberate reversal of today's behaviour. It is independently testable and can ship after
US1 without changing it.

**Independent Test**: As a guest, save several products, confirm they persist across a reload and
appear correctly on product controls, then sign in to an account that already has saved items and
confirm the union is present, nothing was lost, and nothing is duplicated. Sign out and back in and
confirm the result is unchanged. Deliverable value: interest captured at the moment it occurs.

**Acceptance Scenarios**:

1. **Given** a shopper who is not signed in, **When** they activate the save control on a product,
   **Then** it is saved without any sign-in prompt or navigation away from the page.
2. **Given** a guest with saved items, **When** they reload the storefront or relaunch the app on the
   same device, **Then** their saved items are still there.
3. **Given** a guest with saved items on device A, **When** they open the storefront on device B
   without signing in, **Then** device B shows no saved items — guest saves are device-held and this
   is stated to the shopper.
4. **Given** a guest with saved items who signs in to an account that already has saved items,
   **When** sign-in completes, **Then** their saved items are the union of both sets, each product
   appearing exactly once.
5. **Given** the situation in scenario 4, **When** the shopper lands after sign-in, **Then** they are
   **told** how many items were added from this device — the merge is disclosed, never silent.
6. **Given** a shopper who has already merged their device saves into an account, **When** the merge
   is attempted again for any reason, **Then** the result is identical and nothing is duplicated.
7. **Given** a signed-in shopper, **When** they sign out, **Then** no saved items remain readable on
   that device, and their account's saved items are untouched and reappear on next sign-in.
8. **Given** a guest whose device-held list is at its cap, **When** they attempt to save another
   product, **Then** the save is refused with a clear explanation and nothing already saved is
   removed.

---

### User Story 4 - Act on the list (Priority: P3)

From Saved items a shopper can add a single product to their cart, or add everything currently
purchasable in one action. When a bulk add cannot include everything, the shopper is told exactly
what was left behind and why — never silently.

**Why this priority**: This is where a watchlist converts into an order, but it is worthless before
US2 can say truthfully what is purchasable. Independently testable on top of US1 + US2.

**Independent Test**: With a saved list containing a mix of purchasable and non-purchasable items,
add one item and confirm the cart; then use the bulk action and confirm the cart contains exactly
the purchasable items and the shopper was shown an itemised account of the rest.

**Acceptance Scenarios**:

1. **Given** a purchasable saved item, **When** the shopper adds it to the cart, **Then** it appears
   in the cart and remains in Saved items — adding to the cart does not un-save it.
2. **Given** a saved list where every item is purchasable, **When** the shopper adds all, **Then**
   every item is in the cart.
3. **Given** a saved list containing items that are not purchasable, **When** the shopper adds all,
   **Then** only the purchasable items are added, **and** the shopper is shown which items were
   skipped and the reason for each.
4. **Given** a saved list where no item is purchasable, **When** the shopper attempts to add all,
   **Then** the action is unavailable or refuses with an explanation, and the cart is unchanged.
5. **Given** a bulk add that would exceed a cart or ordering limit, **When** the shopper adds all,
   **Then** the shopper is told which items could not be added and why, and the cart is left in a
   consistent state.

---

### User Story 5 - Find my saved items (Priority: P3)

Saved items is reachable from the account area on every customer surface and discoverable from the
storefront itself, and the shopper can order or group the list so it is usable when it is long.

**Why this priority**: A correct list nobody can find delivers nothing — today the web storefront
links it from a single footer entry and omits it from account navigation entirely. Low risk,
independently testable.

**Independent Test**: On each customer surface, reach Saved items from the account area without
prior knowledge of its location; confirm a shopper with a long list can group it and find a known
item.

**Acceptance Scenarios**:

1. **Given** a shopper on any customer surface, **When** they open the account area, **Then** Saved
   items is present as a labelled destination.
2. **Given** a shopper browsing the storefront, **When** they look for their saved items, **Then**
   there is a discoverable entry point that does not require scrolling to the page footer.
3. **Given** a shopper with a long saved list, **When** they group it by category, **Then** items are
   grouped under readable category headings.
4. **Given** a shopper with a long saved list, **When** they choose to order it, **Then** they can at
   minimum order it by most recently saved and see purchasable items first.
5. **Given** a shopper who has never saved anything, **When** they open Saved items, **Then** they
   see an empty state that explains what saving does and offers a route into the store.
6. **Given** a shopper whose every saved item is unpurchasable at their current location, **When**
   they open Saved items, **Then** they see a **different** message from scenario 5 — one that says
   their items exist but none can be delivered where they are, and offers to change the location.

---

### Edge Cases

**Truthfulness of the control**

- A product appears in several places on one screen (a rail and a grid). Both controls MUST show the
  same state, and toggling one MUST update the other.
- The shopper toggles the control faster than the platform can respond. The final state MUST match
  the shopper's last intent, not whichever response arrived last.
- The shopper toggles while offline. The intent is held and applied when connectivity returns; the
  control does not claim success it cannot deliver, nor silently discard the intent.
- The membership answer is unavailable (the platform is unreachable). Controls MUST NOT default to
  *saved* — an unknown state renders as unsaved, because falsely showing *saved* invites the
  destructive second tap this feature exists to eliminate.

**Guest and identity**

- Two different people sign in on the same shared device, and the second person's sign-in would pull
  the first person's guest saves into their account. See FR-032: the merge is **disclosed by count
  on arrival** and every merged item is individually removable, so it is visible and reversible
  rather than silent.
- A guest registers a brand-new account rather than signing in to an existing one — device saves
  join the new account identically.
- A shopper signs in through a federated identity that links into an existing profile. They have one
  profile, therefore one saved list; no split or duplicate list may result.
- The union of a guest list and an account list would exceed the account cap. See FR-047.
- A guest's device-held list exists from a previous version of the storefront in an older format.
  It is discarded rather than misread.

**Purchasability and lifecycle**

- The shopper has no delivery location at all (a guest who has not said where they live). The list
  MUST say purchasability is undetermined — never that items are available.
- A saved product is sold in one delivery area and not another; the shopper switches address between
  two areas. The verdict flips, and the reason shown changes with it.
- A product is withdrawn from sale while it sits in a shopper's list. It stays visible, marked.
- A product is renamed, re-imaged, or re-priced after being saved. The list shows the product's
  **current** identity, not a stale copy — only the price at the time of saving is remembered, and
  only so a change can be detected.
- A product's price rises after being saved. The current price is shown; no "drop" indicator appears.
- A saved product is removed from the catalogue outright. The shopper MUST NOT simply find a shorter
  list with no explanation.
- The shopper's account is barred. See FR-053.

**Scale and limits**

- The account cap is reached. Saving is refused with a named reason; **no existing saved item is ever
  evicted to make room**.
- A shopper holds a full list and opens it. The list must remain usable and responsive at the cap.
- Removing an item then re-saving the same product later: it is treated as a **new** save and takes
  a new position and a new remembered price. This is distinct from undo (FR-018).

**Removal of the previous capability**

- A shopper had saved items under the previous capability. Those are not carried forward (FR-005) —
  the shopper's list starts empty. This is an accepted consequence of the replacement.
- A shopper has a bookmarked or shared link to the previous capability's page. It must not lead to a
  broken or blank surface.

---

## Requirements *(mandatory)*

### A. Replacement of the previous capability

- **FR-001**: The platform MUST remove the previous favourites capability in its entirety, including
  its shopper-facing surfaces, its stored saved-item data, and its entry points on every customer
  surface. No part of it may remain reachable.
- **FR-002**: The previous capability's declared-but-never-emitted analytics event and its
  documentation as a shipped event MUST be removed or replaced by the events this feature actually
  emits (FR-060). Documentation MUST NOT continue to describe unemitted behaviour as shipped.
- **FR-003**: The cart's existing **save-for-later** capability is a **different capability** and MUST
  NOT be touched, merged, renamed, or re-pointed at this feature's data. It keeps its own affordance
  (a bookmark, not a heart) and its own behaviour.
- **FR-004**: Any previously reachable address for the removed capability MUST resolve to the new
  Saved items surface or to a clear destination — never to a broken or blank page.
- **FR-005**: Saved items recorded under the previous capability are **not** carried forward. Shoppers
  begin this feature with an empty list. This MUST be stated to the operator as a known consequence
  before the change is applied.

### B. Saving and un-saving

- **FR-006**: Shoppers MUST be able to save and un-save a product from the product detail surface.
- **FR-007**: Shoppers MUST be able to save and un-save a product directly from a product tile in
  browse results, search results, and home-screen rails, without opening the product.
  - **⚠ AMENDED 2026-08-02, web only, on measured evidence.** On the web storefront the control ships
    on home rails, browse and product detail, and is **omitted from the search results grid**. It is
    present on **every** mobile tile surface, search included.
  - **Why**: `/search` is the one route where the whole search experience is a client component, so
    it already carries the product-tile code in the guest bundle. Adding the control took it from
    **173.9 KB to 174.6 KB against a hard 174 KB budget**. Four reclaim attempts were measured —
    dynamic telemetry import (**0 KB**), inline SVG instead of the icon library (**0.1 KB worse**),
    icon → text glyph (**0.1 KB**), deferring the price filter (**0.1 KB, plus a visible flash**) —
    recovering 0.2 KB of the 0.7 needed.
  - **The budget was NOT raised.** That is the standing rule ("reduce the web presentation — do not
    raise the limit"), and the framework floor already consumes 143.5 KB of the 174.
  - **⚠ This is a real reduction in the feature, not a technicality.** Search is plausibly the moment
    a shopper most wants to save something. It is recorded here, in the parity register, and in the
    code at the call site, so it can be revisited the moment the route has headroom — not discovered
    later as an unexplained inconsistency.
- **FR-008**: Shoppers MUST be able to save a product from a line in their order history.
- **FR-009**: Saving MUST be idempotent: saving a product already saved leaves the list unchanged and
  is not an error.
- **FR-010**: Un-saving MUST be idempotent: un-saving a product that is not saved leaves the list
  unchanged and is not an error.
- **FR-011**: A repeated, retried, or duplicated save or un-save request MUST NOT be able to leave the
  saved state inverted relative to the shopper's intent.
- **FR-012**: The save control MUST respond immediately to the shopper (optimistically) and MUST
  revert to its previous state, with an explanation, if the platform refuses or fails to record it.
- **FR-013**: When the same product is represented more than once on a screen, all its controls MUST
  show the same state and MUST update together when any one is activated.
- **FR-014**: Rapid repeated activation MUST resolve to the shopper's **last intent**, independent of
  the order in which platform responses arrive.
- **FR-015**: The saved list MUST be ordered most-recently-saved first by default.
- **FR-016**: Shoppers MUST be able to remove an item directly from the saved list.
- **FR-017**: Removal from the saved list MUST offer an undo affordance, and removal MUST also be
  reversible by saving the product again through the normal control — undo is never the only route.
- **FR-018**: An undone removal MUST restore the item to the **position it previously held** in the
  list. Saving a product again after a completed removal is a **new** save and takes the newest
  position.

### C. The truth of the control

- **FR-019**: Wherever a save control is shown, it MUST reflect that product's actual saved state on
  first render, without requiring the shopper to interact with it. This is the primary requirement of
  this feature.
- **FR-020**: Showing saved state MUST NOT slow a screen's first display in proportion to how many
  products it shows — a screen of forty products must not pay forty times the cost of a screen of one.
- **FR-021**: Showing saved state MUST NOT slow down how quickly storefront content reaches shoppers
  who are not signed in, nor make content that is the same for every shopper behave as though it were
  different for each one.
- **FR-022**: If saved state cannot be determined, controls MUST render as **unsaved**, never as
  saved, and activating one MUST still perform the shopper's intended action correctly.
- **FR-023**: Saved state MUST be consistent across a shopper's devices for a signed-in shopper within
  the freshness window stated in SC-004.

### D. Guests and joining an account

- **FR-024**: Shoppers who are not signed in MUST be able to save and un-save products without being
  prompted to sign in and without being navigated away from what they were doing.
- **FR-025**: A guest's saved items MUST persist on that device across page reloads and application
  restarts.
- **FR-026**: A guest's saved items MUST drive the save control's state exactly as a signed-in
  shopper's do (FR-019).
- **FR-027**: The platform MUST make clear to a guest that their saved items are held on that device
  only and are not available on their other devices.
- **FR-028**: When a guest signs in or registers, their device-held saved items MUST join the
  account's saved items as a **union** — nothing lost, nothing duplicated.
- **FR-029**: Joining MUST be idempotent: performing it more than once produces the same result as
  performing it once.
- **FR-030**: After a successful join, the device-held list MUST be cleared, so that the account's
  list is thereafter the single source of the shopper's saved items on that device.
- **FR-031**: On sign-out, no saved items MUST remain readable on the device, and the account's saved
  items MUST be unaffected.
- **FR-032**: A join MUST be **disclosed** to the shopper — they are told how many items were added
  from this device — and every joined item MUST be individually removable. A join MUST NOT be silent.
- **FR-033**: A guest's device-held list MUST be subject to its own cap (FR-046), smaller than the
  account cap.
- **FR-034**: A device-held list that cannot be read in the expected format MUST be discarded safely
  rather than partially interpreted.

### E. What the list tells the shopper

- **FR-035**: For each saved item the list MUST state the shopper's ability to buy it as exactly one
  of these outcomes:
  - **Purchasable** — can be added to the cart now for this shopper's delivery location;
  - **Temporarily unavailable** — sold and delivered here, but not in stock;
  - **Not delivered to your area** — sold and in stock, but no fulfilment covers this location;
  - **No longer sold** — withdrawn from sale entirely;
  - **Not yet determined** — the shopper has not told the platform where they live.
- **FR-036**: These outcomes MUST be expressed in distinct shopper-facing language. "Unavailable" and
  "we don't deliver that to you" are different statements and MUST NOT be collapsed into one.
- **FR-037**: Purchasability MUST be decided against the shopper's **current delivery location**, not
  against catalogue status alone.
- **FR-038**: A shopper with no delivery location MUST be shown "not yet determined" and offered a way
  to set one. The platform MUST NOT present such items as available.
- **FR-039**: When the shopper's delivery location changes, purchasability MUST be re-decided for
  every item in the list.
- **FR-040**: An item that is not purchasable because it is not delivered to the shopper's area MUST
  offer the shopper a route to change their delivery location.
- **FR-041**: A product withdrawn from sale MUST remain visible in the list, marked as no longer sold.
  It MUST NOT be silently removed.
- **FR-042**: The platform MUST record the product's price at the moment it was saved, so that a later
  change can be detected.
- **FR-043**: When a saved product's current price is lower than the price recorded at save time, the
  list MUST indicate the drop and show what the price was when saved.
- **FR-044**: When a saved product's current price is unchanged or higher, the list MUST show the
  current price with no change indicator. The current price MUST always be shown regardless.
- **FR-045**: The list MUST show each product's **current** name, image, and price — not a copy taken
  at save time. Only the saved-time price is remembered, and only for FR-043.

### F. Limits

- **FR-046**: The number of items a shopper may save MUST be capped, with a smaller cap for a
  device-held guest list than for an account list.
- **FR-047**: When a save would exceed the cap, the platform MUST **refuse** it and tell the shopper
  why. It MUST NOT evict an existing saved item to make room, under any circumstance — including when
  a guest list joins an account list and the union would exceed the cap.
- **FR-048**: When a join would exceed the account cap, the shopper MUST be told that not everything
  could be added and which items were not.

### G. Acting on the list

- **FR-049**: Shoppers MUST be able to add a single purchasable saved item to their cart from the
  list.
- **FR-050**: Adding a saved item to the cart MUST NOT remove it from the saved list.
  - **⚠ REAFFIRMED 2026-08-02, on operator direction, with the eBay watchlist as the reference**
    (Principle V names eBay as this capability's reference platform).
  - **Two genres of list behave oppositely, and the platform has one of each.** A *staging* list — the
    cart's own set-aside (027) — is **consumed** when its item moves to the cart, because it is a
    holding area for the cart. A *watchlist* is **not**, because it is a standing interest in a
    product. Amazon's "Save for later" is the first; eBay's Watchlist, Amazon's Wish List, and the
    Woolworths / Coles favourites lists are the second. This is the second.
  - **Groceries are re-bought.** A list that empties itself as you shop must be rebuilt every week —
    which is why Tesco and Sainsbury's derive favourites from purchase history instead of asking
    shoppers to curate them at all.
  - **⚠ Removing it would also destroy the thing being watched.** The entry carries the price at save
    time (FR-042), and price drops are measured against it (FR-043). Consume the entry on add and the
    watch ends; re-saving later starts a *new* baseline at today's price, so the shopper silently loses
    the drop they were waiting for.
- **FR-050a**: Where a saved item is already in the cart, the list MUST say so rather than offering to
  add it again, and MUST offer a route to the cart.
  - **⚠ ADDED 2026-08-02.** FR-050 keeps the item on the list, which is right — but a row that goes on
    saying "Add to cart" invites a tap that is **not** a no-op: a repeat add **increments the
    quantity**. The shopper ends up with two and finds out at the till. The rule closes the gap FR-050
    opens.
  - The count MUST be stated: "in your cart" and "two of these are in your cart" are different facts,
    and the second is the one a shopper needs to catch a mistake.
  - **⚠ A quantity control on the saved list is deliberately NOT required.** Quantity belongs to the
    cart; a stepper here would make two screens responsible for one number.
- **FR-051**: Shoppers MUST be able to add all currently purchasable saved items to their cart in one
  action.
- **FR-052**: A bulk add MUST NOT silently omit anything. It MUST either complete for every item or
  tell the shopper exactly which items were not added and the reason for each.
- **FR-053**: ~~A shopper whose account is barred MUST NOT be able to add saved items to a cart; their
  list remains readable.~~
  - **⚠ AMENDED 2026-08-02 — the second half was unbuildable, and building it would have been wrong.**
    A barred shopper is refused **everything** on saved items, the list included.
  - **Why**: the platform's barred-customer gate is uniform. `customeridentity.Middleware` resolves the
    shopper once and answers **403 on every customer-scoped route** — cart, orders, checkout, addresses.
    Keeping the list readable would have meant a bespoke gate for this one resource.
  - **⚠ That is a security posture, not an inconvenience.** A barred account is one the platform has
    decided to stop serving; carving out a read for it means a second, weaker authorization path that
    exists nowhere else and would have to be re-audited on its own. The convenience of a readable list
    does not justify it.
  - The requirement's **first half stands and is satisfied**: a barred shopper cannot add to a cart —
    by the same gate, before the request reaches this feature at all.

### H. Reaching and reading the list

- **FR-054**: Saved items MUST be reachable from the account area on every customer surface.
- **FR-055**: Saved items MUST have a discoverable storefront entry point that does not depend on a
  page footer.
- **FR-056**: Shoppers MUST be able to group the saved list by product category, and to order it by
  most recently saved and by purchasable-first.
- **FR-057**: There is exactly ONE empty state, and it means one thing: the shopper has saved nothing.
  When the shopper HAS saved items but none can be delivered where they are, the list **MUST still
  render every saved item**, with a notice above it explaining the situation and offering a way to
  change the delivery location.
  - **⚠ CLARIFIED 2026-08-02, after the first build got it wrong.** The original wording ("the empty
    state … and the state for …  MUST be distinct") was read as licence to replace the whole list with
    a second full-screen empty state. That **hid items the shopper had deliberately saved** and made a
    full list look like a lost one — caught on device.
  - It is **FR-041's rule one level up**: a withdrawn product must not silently vanish from the list,
    and neither must an undeliverable one. The requirement was always about a distinct **message**, not
    about withholding the list.
  - The per-item verdict (FR-035/FR-036) already says which items cannot come; the notice only explains
    why none of them can, right now.
- **FR-068**: Shoppers MUST be able to refresh the saved list **on demand**, in whatever state it is
  showing — including while it is loading and after it has failed to load — and a refresh MUST NOT
  clear what is already on screen.
  - **⚠ ADDED 2026-08-02, on operator direction.** The list is a watchlist: its entire value is that
    the price and the purchasability it shows are *current*. A shopper who has just been told a price
    dropped, or who has moved back into signal, needs a way to ask "is this still true?" — and without
    one the only answer is to leave the screen and come back, which reads as a broken screen rather
    than a stale one.
  - "In whatever state" is load-bearing: **empty and failed are exactly the states a shopper doubts
    most**, so refusing the gesture there withholds it precisely where it is wanted (the same reasoning
    027 recorded for the empty cart).
  - A failed refresh MUST leave the list as it was. "We could not check" must never read as "you have
    nothing".

### I. Accessibility and presentation

- **FR-058**: The save control MUST be a single toggle whose **accessible name does not change** when
  its state changes; its pressed/unpressed state MUST be conveyed separately, so assistive technology
  announces one consistent control whose state changed — not two different controls.
- **FR-059**: Because the design language carries no brand hue, the saved and unsaved states of the
  control MUST be distinguishable **without relying on colour** — by shape, fill, and announced state
  alone — and this MUST be verified by observation with real shoppers (SC-009), not assumed.

### J. Measurement

- **FR-060**: The platform MUST emit events sufficient to measure: how often shoppers save (save
  rate), how often a saved item is subsequently added to a cart (save-to-cart), and how often shoppers
  return to the saved list.
- **FR-061**: Events MUST record which surface a save originated from (product detail, tile, order
  history), so the placements added by FR-007 and FR-008 can be evaluated.
- **FR-062**: Telemetry MUST carry no personal information beyond the shopper's authentication subject
  identifier, and MUST respect the shopper's analytics consent.

### K. Explicitly out of scope

- **FR-063**: This feature MUST NOT deliver price-drop or back-in-stock **notifications** of any kind.
  It records the data that makes them detectable (FR-042) and nothing more. Notifications are a
  reserved sibling feature, and their design intent is a **batched digest**, never a per-item alert.
- **FR-064**: This feature MUST NOT build a derived repeat-purchase list ("Buy It Again"). The name is
  reserved for a sibling feature.
- **FR-065**: This feature MUST NOT provide public sharing of a saved list.
- **FR-066**: This feature MUST NOT provide multiple or named lists. There is exactly one saved list
  per shopper.
- **FR-067**: The word "wishlist" MUST NOT appear in any shopper-facing text.

### Key Entities

- **Saved item**: A shopper's deliberate record of interest in a product. Belongs to exactly one
  shopper (or, before sign-in, to one device). Holds the product it refers to, when it was saved
  (which determines list position), and the product's price at the moment of saving (which exists
  solely so a later price drop can be detected). A shopper may hold at most one saved item per
  product.
- **Device-held saved list**: The set of saved items belonging to a guest on one device, before any
  account exists to own them. Bounded by a smaller cap than an account list. Joins an account list
  on sign-in and is then discarded.
- **Purchasability verdict**: The answer, for one saved item and one shopper delivery location, to
  "can this be bought right now?" — one of purchasable, temporarily unavailable, not delivered to
  your area, no longer sold, or not yet determined. It is derived, never stored, and changes when the
  shopper's delivery location changes.
- **Price movement**: The relationship between a saved item's remembered save-time price and the
  product's current price. Surfaced only when the current price is lower.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 20 out of 20 trials across all customer surfaces, a product saved in a previous
  session displays as saved on first render when re-opened, with no interaction — measured on the
  product detail surface, on a tile in a grid, on a tile in a rail, and on an order-history line.
- **SC-002**: In 20 out of 20 trials, no sequence of taps, retries, or connectivity interruptions
  leaves a product's saved state opposite to the shopper's last expressed intent.
- **SC-003**: A shopper can save a product they are looking at in **one action**, from any of the four
  placements in SC-001, without leaving the screen they are on.
- **SC-004**: A save made on one device is reflected on a signed-in shopper's other device within 60
  seconds of that device next requesting the storefront.
- **SC-005**: A screen of 24 products shows correct saved state for all 24, and its time to first
  display is within 10% of the same screen measured with saved state absent; the same holds for a
  screen of 48 products, demonstrating the cost does not grow with the number of products shown.
- **SC-006**: For a saved list at its full cap, the list opens and displays complete purchasability
  verdicts within 2 seconds on a typical connection.
- **SC-007**: In a test set containing at least one product in each of the five purchasability
  outcomes, the list reports the correct outcome for 100% of items, and five out of five observers
  correctly restate what action each message implies (wait, change address, give up, tell us where
  you live, buy now).
- **SC-008**: Zero saved items are lost, duplicated, or silently evicted across 20 guest→sign-in
  joins, including repeated joins, joins into an account that already holds the same products, and
  joins that would exceed the account cap.
- **SC-009**: Five out of five observers, including at least one using a screen reader and at least
  one at the largest supported text size, correctly identify which products are saved and which are
  not, in both light and dark appearance, **without using colour**.
- **SC-010**: A bulk add from a mixed list adds 100% of purchasable items and reports 100% of skipped
  items with a reason; zero items are omitted without explanation.
- **SC-011**: Five out of five shoppers unfamiliar with the product locate Saved items from the
  account area on each customer surface without assistance.
- **SC-012**: Guest save rate is measurable from day one, and the proportion of saves made by
  not-signed-in shoppers is reportable — the feature's central bet (that guest saving materially
  increases saving) is testable rather than assumed.
- **SC-013**: Save-to-cart conversion is reportable from day one, broken down by the surface the save
  originated from.
- **SC-014**: Automated coverage exists for saving, un-saving, idempotency in both directions, the
  guest→account join, cap refusal, and each of the five purchasability outcomes — replacing a
  predecessor that had none.
- **SC-015**: After the change is applied, no shopper-facing route, control, or stored record from the
  previous favourites capability remains reachable, and the cart's save-for-later capability behaves
  exactly as it did before, proven by its existing behaviour being unchanged.

---

## Assumptions

Decisions taken where the description left a reasonable default, and the reasoning for each:

- **Account cap of 200 saved items; guest cap of 50.** Comparable platforms cap explicitly (400 and
  250 are common); 200 is generous for grocery, keeps a whole-list read cheap, and bounds abuse. The
  guest cap is smaller because a device-held list has no account behind it. Exact numbers are a
  product lever, not a structural commitment.
- **Undo restores the original list position (FR-018).** Undo means "that removal did not happen";
  promoting the item to the top would make undo lossy in a different way. A deliberate re-save after
  a completed removal is a genuinely new save and correctly goes to the top.
- **The guest→account join is automatic and disclosed, not confirmed.** Requiring confirmation adds
  friction to the exact moment the feature is trying to make frictionless, and a join is
  non-destructive — it only ever adds. The shared-device hazard is answered by **visibility**: the
  shopper is told the count on arrival (FR-032) and can remove any item individually. If observation
  shows shoppers are surprised by merged items, escalating to an explicit confirmation is a
  contained change.
- **The device-held guest list is cleared after joining and on sign-out (FR-030, FR-031).** Leaving a
  signed-in shopper's saves behind on the device after sign-out would expose one person's interests to
  the next user of a shared device.
- **Price rises are not badged (FR-044).** The current price is always shown, so nothing is hidden; a
  watchlist's actionable signal is the drop. Badging rises would add noise without an action.
- **Only the save-time price is remembered — never a full snapshot of the product (FR-045).** Name,
  image and current price are read live, so a renamed or re-imaged product shows its true current
  identity. The saved-time price exists solely to detect movement.
- **A withdrawn product's entry persists (FR-041).** The shopper deliberately saved it; a shorter list
  with no explanation is a worse outcome than a marked dead entry they can dismiss themselves.
- **An undeterminable saved state renders as unsaved (FR-022).** The asymmetry is deliberate: falsely
  showing *unsaved* costs a redundant, harmless save; falsely showing *saved* invites the destructive
  second tap that this feature exists to eliminate.
- **Previously saved data is discarded rather than migrated (FR-005).** This is a replacement, and the
  predecessor's records lack the save-time price the new model requires; a migration would fabricate
  a baseline price that was never observed.
- **Purchasability is derived per request, never stored (Key Entities).** It depends on the shopper's
  current delivery location, which can change between two views of the same list.

### Dependencies

- **Delivery location and area coverage.** Purchasability (FR-035, FR-037) depends on the existing
  ability to determine a shopper's delivery location and whether products can be delivered to it. A
  shopper with no location set is a first-class case (FR-038), not an error.
- **Product catalogue.** Saved items refer to catalogue products and read their current identity and
  price live (FR-045).
- **Cart.** Adding from the saved list (FR-049, FR-051) uses the existing cart, including its own
  limits and rules (FR-052).
- **Customer identity and sign-in.** The guest→account join (FR-028) triggers on sign-in and
  registration, including federated sign-in that links into an existing profile.
- **Order history.** Saving from an order line (FR-008) depends on order history being available to
  the shopper.
- **Analytics consent.** Telemetry (FR-062) respects the shopper's existing consent state.

### Out-of-scope dependencies deliberately not taken

- **No notification delivery path is required.** FR-063 keeps this feature buildable today: there is
  no running notification worker and no push delivery in place, so specifying alerts here would
  create a requirement that cannot be satisfied.
