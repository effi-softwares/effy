# Feature Specification: Customer Lists

**Feature Branch**: `068-customer-lists`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Customer lists" — client feedback round of October 2026, requirement
R3 in [docs/prd/2026-10-client-feedback-prd.md](../../docs/prd/2026-10-client-feedback-prd.md).

## Why this slice exists

**A shopper who buys the same basket every week has nowhere to keep it.**

Saved items (033) is one flat list per customer. It answers "is this worth acting on yet?" for
things a shopper is watching. It does not let a shopper say "these twelve things are my weekly
shop, and these four are what I buy every day". Everything saved sits in one pile, and the
"add everything to cart" action puts the whole pile in the cart.

The client asked for this as "Add New Category, similar to Favorite", with Weekly Items and Daily
Items as the examples. This spec reads that as **lists the customer creates and names for
themselves**, not as new product categories managed by shops or staff.

**This reverses a recorded decision.** 033 FR-066 says "there is exactly one saved list per
shopper". That rule is retired by this feature. Everything else 033 decided still holds: saved
items is a watchlist, adding to the cart never removes an item from a list, the heart tells the
truth on first display, and the word "wishlist" appears nowhere a shopper can read it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Make a list and put products in it (Priority: P1)

A signed-in shopper creates a list and names it "Weekly Items". From a product they choose which of
their lists it belongs in, and can create a new list at that moment without leaving the product.
The list has its own page showing what is in it, with the same information the saved-items list
shows today: current price, whether the product can be bought right now, add to cart, remove.

**Why this priority**: This is the capability the client asked for. Nothing else in the slice has
anything to act on until a list exists and holds products.

**Independent Test**: Create a list, add five products to it from product pages and tiles, open
the list's page and confirm all five are there with correct price and availability, and that the
default "Saved" list is unchanged by any of it unless the shopper put the product there too.

**Acceptance Scenarios**:

1. **Given** a signed-in shopper with no lists of their own, **When** they create a list named
   "Weekly Items", **Then** it appears among their lists, empty, alongside the default "Saved" list.
2. **Given** a shopper viewing a product, **When** they open the list chooser, **Then** they see
   every list they own, each marked with whether this product is already in it.
3. **Given** the list chooser, **When** the shopper selects "Weekly Items", **Then** the product is
   in "Weekly Items" and its heart shows as saved.
4. **Given** the list chooser, **When** the shopper creates a new list by name, **Then** the list is
   created and the product is placed in it in the same action.
5. **Given** a product already in "Saved", **When** the shopper also adds it to "Weekly Items",
   **Then** it is in both lists.
6. **Given** a list with products in it, **When** the shopper opens that list's page, **Then** each
   product shows its current price, its purchasability verdict, a way to add it to the cart and a
   way to remove it from this list.
7. **Given** a shopper creating a list, **When** they give it a name they already use, **Then** the
   list is not created and they are told the name is taken.

---

### User Story 2 - Do the weekly shop in one action (Priority: P1)

A shopper opens "Weekly Items" and adds everything currently purchasable to the cart in one action.
Anything that could not be added is named, with the reason. The list is unchanged afterwards, so
next week the same action works again.

**Why this priority**: Equal-first with US1. This is the reason a shopper builds a named list at
all; a list that can only be read is a bookmark folder.

**Independent Test**: Build a list of five purchasable products and add all; confirm the cart holds
exactly those five and the list still holds all five. Repeat with a mixed list and confirm only the
purchasable ones were added and every skipped product was named with its reason.

**Acceptance Scenarios**:

1. **Given** a list of five purchasable products, **When** the shopper adds all to the cart,
   **Then** all five are in the cart and all five are still in the list.
2. **Given** a list containing products that cannot be bought right now, **When** the shopper adds
   all, **Then** only the purchasable ones are added and the shopper is shown each skipped product
   and why.
3. **Given** two lists, **When** the shopper adds all from one, **Then** nothing from the other
   list is added.
4. **Given** a list where nothing is purchasable, **When** the shopper looks for the add-all
   action, **Then** it is unavailable and says why, and the cart is unchanged.
5. **Given** a list containing a product already in the cart, **When** the shopper views the list,
   **Then** that row says it is in the cart and how many, as the saved-items list does today.

---

### User Story 3 - The heart still takes one tap and still tells the truth (Priority: P1)

Nothing a shopper does today takes longer. Tapping an empty heart saves the product to "Saved" in
one tap, with no question asked. The heart is filled when the product is in any of the shopper's
lists. Everything a shopper had saved before this feature is in "Saved" afterwards, in the same
order, with the same remembered prices.

**Why this priority**: Equal-first, because it is what must not break. 033 exists because the
heart once lied and a second tap destroyed the save. Lists add a new way for that to happen: a
filled heart whose tap silently removes a product from three lists at once.

**Independent Test**: With saved items recorded before the feature, confirm every one is in "Saved"
with its position and price-drop indication intact. Save a product with one tap. Put a product
only in a named list and confirm its heart is filled wherever the product appears. Tap a filled
heart on a product held in named lists and confirm nothing is removed without the shopper choosing.

**Acceptance Scenarios**:

1. **Given** a shopper viewing a product in none of their lists, **When** they tap the heart,
   **Then** the product is saved to "Saved" immediately, with no list question in the way.
2. **Given** a product just saved, **When** the save is confirmed to the shopper, **Then** the
   confirmation offers a way to choose or create a different list.
3. **Given** a product that is only in "Weekly Items", **When** it appears on any screen, **Then**
   its heart is filled on first display.
4. **Given** a product that is only in "Saved", **When** the shopper taps its filled heart,
   **Then** it is un-saved, as today.
5. **Given** a product that is in one or more named lists, **When** the shopper taps its filled
   heart, **Then** the list chooser opens showing where it is held, and nothing is removed until
   the shopper chooses.
6. **Given** a shopper with saved items from before this feature, **When** the feature is
   released, **Then** every one of them is in "Saved", in its previous order, and any price-drop
   indication it showed is still shown.
7. **Given** a screen showing many products, **When** it first displays, **Then** every heart
   reflects that product's real state without the screen taking longer as the shopper's number of
   lists grows.

---

### User Story 4 - Keep lists tidy (Priority: P2)

A shopper renames a list, removes a product from one list without affecting the others, and
deletes a list they no longer want. Deleting a list never removes a product from any other list.
"Saved" cannot be renamed or deleted.

**Why this priority**: Lists that cannot be corrected go stale and get abandoned, but a shopper
gets the core value (US1 to US3) before they ever need to tidy.

**Independent Test**: Rename a list and confirm its contents are unchanged. Put one product in two
lists, remove it from one, and confirm it is still in the other with its heart filled. Delete a
list and confirm its products remain in every other list they were in.

**Acceptance Scenarios**:

1. **Given** a list named "Weekly Items", **When** the shopper renames it "Weekly Shop", **Then**
   the name changes everywhere and its contents and their order do not.
2. **Given** a product in both "Saved" and "Weekly Items", **When** the shopper removes it from
   "Weekly Items", **Then** it is still in "Saved" and its heart is still filled.
3. **Given** a product removed from a list, **When** the shopper uses undo, **Then** it returns to
   the position it held in that list.
4. **Given** a shopper deleting a list, **When** they are asked to confirm, **Then** they are told
   how many products are in it and how many of those are in no other list and will stop being
   saved.
5. **Given** a deleted list, **When** the shopper views their other lists, **Then** every product
   that was also in another list is still there.
6. **Given** the default "Saved" list, **When** the shopper looks for rename or delete, **Then**
   neither is offered.

---

### User Story 5 - Guests keep one list (Priority: P3)

A shopper who is not signed in saves products exactly as today, into one list held on the device.
Making a named list asks them to sign in. When they sign in, the device's saves join the account's
"Saved" list, as today.

**Why this priority**: It is the existing guest behaviour, kept. It needs stating so that named
lists do not quietly appear for guests or break the join on sign-in.

**Independent Test**: As a guest, save products and confirm no named-list controls work without
signing in. Sign in to an account that has named lists and confirm the device's saves are in
"Saved", the count is disclosed, and no named list changed.

**Acceptance Scenarios**:

1. **Given** a guest, **When** they tap a heart, **Then** the product is saved on the device with
   no sign-in prompt, as today.
2. **Given** a guest, **When** they try to create a list or choose one, **Then** they are told
   named lists need an account and offered sign-in; their save is not lost.
3. **Given** a guest with saved products who signs in to an account with named lists, **When**
   sign-in completes, **Then** the device's saves are in the account's "Saved" list and the named
   lists are unchanged.

---

### Edge Cases

**Names**

- A name that differs from an existing one only by letter case or surrounding spaces is the same
  name and is refused.
- A name of only spaces is refused. A name at the length limit is accepted; a longer one is
  refused, including when the request did not come from a customer screen.
- A shopper tries to name a list "Saved". Refused: that name belongs to the default list.
- Emoji and non-English text in a name are accepted and shown as typed. Text that looks like
  markup or a link is shown as the plain characters typed.

**Membership**

- The same product is added to the same list twice (double tap, retry, two devices). It is in the
  list once.
- A product is in three lists and is withdrawn from sale. It stays in all three, marked as no
  longer sold, as 033 requires for the single list.
- A product is removed from the last list holding it. It is no longer saved, its heart empties
  everywhere, and its remembered price is forgotten; saving it again later is a new save.
- A product is added to a second list months after it was first saved. Both lists show the same
  price-drop indication, measured from the first save.

**Limits**

- The shopper is at the limit of lists and tries to create another. Refused with the reason; no
  existing list is removed to make room.
- The shopper is at the limit of saved products and adds an already-saved product to another list.
  Allowed: it is not a new saved product.
- The shopper is at the limit of saved products and saves a new one. Refused with the reason, as
  today; nothing is evicted.

**Two devices**

- A list is deleted on one device while the other is adding a product to it. The add is refused
  and explained. The product is not silently placed in a different list.
- A list is renamed on one device. The other shows the new name the next time it reads the lists.
- Two devices create a list with the same name at the same moment. One list exists.

**Acting on a list**

- Add-all from a list that would exceed a cart or ordering limit: the shopper is told which
  products could not be added and why, as for the single list today.
- The same product is in two lists and the shopper adds all from both. The second add raises the
  quantity in the cart, exactly as adding it twice by hand would; the list row said it was already
  in the cart and how many.

**Unknown state**

- The shopper's lists cannot be read. Hearts show as empty, never filled, and tapping one still
  does what the shopper meant (033 FR-022).

**Account state**

- A barred shopper is refused lists exactly as they are refused saved items and the cart today.
- A shopper closes their account. Their lists go with it.

## Requirements *(mandatory)*

### Functional Requirements

**Lists**

- **FR-001**: A signed-in shopper MUST be able to create a list and give it a name.
- **FR-002**: A list name MUST be free text of 1 to 40 characters after surrounding spaces are
  removed, and MUST be unique among that shopper's lists, compared without regard to letter case.
- **FR-003**: Every shopper MUST have a default list, shown as "Saved". It MUST exist without the
  shopper creating it, and MUST NOT be renamable or deletable.
- **FR-004**: A shopper MUST be able to rename any list they created. Renaming MUST NOT change the
  list's contents or their order.
- **FR-005**: A shopper MUST be able to delete any list they created. Deleting MUST remove that
  list and its entries only; a product that is also in another list MUST remain there.
- **FR-006**: Before a list is deleted the shopper MUST be asked to confirm, and MUST be told how
  many products it holds and how many of them are in no other list.
- **FR-007**: A shopper MUST be able to hold up to 20 lists of their own in addition to "Saved".
  Creating one beyond the limit MUST be refused with the reason. No list is ever removed to make
  room.
- **FR-008**: A shopper's lists MUST be visible only to that shopper.
- **FR-009**: The name limit, uniqueness and the list limit MUST be enforced by the platform, not
  only by the screen the shopper types into.
- **FR-010**: A list name MUST be shown as plain text everywhere and never interpreted.

**Putting products in lists**

- **FR-011**: A product MAY be in more than one of a shopper's lists, and MUST NOT appear more than
  once in the same list.
- **FR-012**: Saving a product from the heart MUST take one action and MUST place it in "Saved".
  No list question may stand between the tap and the save.
- **FR-013**: After a one-tap save, the shopper MUST be offered a way to choose or create another
  list for that product, without that offer delaying or blocking the save.
- **FR-014**: A list chooser MUST be available for a product from four places: the product's own
  page, each row of a list's page, the confirmation shown after a one-tap save, and the filled
  heart of a product held in a named list (FR-020). It MUST show every list the shopper owns and
  whether the product is in each, and MUST let the shopper add the product to a list or remove it
  from one.
  - **⚠ NARROWED 2026-10-04, at planning.** The first wording said "wherever its heart is shown".
    A heart on a tile has one tap, and FR-019 already gives that tap to un-saving a product that is
    only in "Saved". A second gesture on the tile (press-and-hold) has no web equivalent and would
    break parity (FR-041). The product page is one tap away from every tile.
- **FR-015**: The list chooser MUST let the shopper create a new list and place the product in it
  in one action.
- **FR-016**: Adding to and removing from a list MUST each be idempotent, and a repeated or retried
  request MUST NOT leave membership opposite to the shopper's last intent (033 FR-009 to FR-011,
  FR-014, now per list).
- **FR-017**: A new entry MUST take the newest position in the list it was added to. Each list
  keeps its own order.

**The heart**

- **FR-018**: A product's heart MUST show as saved when the product is in any of the shopper's
  lists, and as unsaved when it is in none, on first display and without interaction.
- **FR-019**: Tapping the heart of a product that is in "Saved" and no other list MUST un-save it,
  as today.
- **FR-020**: Tapping the heart of a product that is in any list other than "Saved" MUST open the
  list chooser. It MUST NOT remove the product from any list by itself.
- **FR-021**: Showing heart state for a screen of products MUST cost no more than it does today,
  whatever number of lists the shopper has. Every rule 033 set for the heart's truthfulness
  (033 FR-013, FR-019 to FR-023) continues to hold.
- **FR-022**: The list chooser MUST NOT slow the first display of any screen for a shopper who
  does not open it.

**A list's page**

- **FR-023**: Each list MUST have its own page showing its products with everything the saved-items
  list shows today: current name, image and price, the purchasability verdict exactly as
  the saved-items list states it today, the price-drop indication, the in-cart statement and count, add to cart, and remove.
- **FR-024**: Removing a product from a list's page MUST remove it from that list only, and MUST
  offer undo that restores its previous position in that list.
- **FR-025**: Grouping, ordering, refresh on demand, and the empty-list message
  MUST work on every list's page as they do on the saved-items list today.
- **FR-026**: An empty list of the shopper's own MUST say it is empty and offer a route into the
  store. It MUST NOT read as though the shopper has saved nothing at all when other lists hold
  products.
- **FR-027**: The shopper MUST be able to see all their lists in one place, "Saved" first, each
  with the number of products it holds, and reach any list's page from there. That place MUST be
  reachable wherever Saved items is reachable today.

**Acting on a list**

- **FR-028**: A shopper MUST be able to add every currently purchasable product in one list to the
  cart in one action. Only that list's products are added.
- **FR-029**: Adding from a list to the cart, singly or all at once, MUST NOT remove anything from
  the list (033 FR-050).
- **FR-030**: An add-all MUST NOT silently omit anything: every product not added MUST be named to
  the shopper with its reason (033 FR-052).

**The remembered price**

- **FR-031**: The price remembered for a saved product MUST be the price when the shopper first
  saved it to any list. It MUST be the same in every list that holds the product, and MUST be kept
  for as long as the product is in at least one list.
- **FR-032**: When a product leaves the last list holding it, it is no longer saved; saving it
  again later MUST be a new save with a new remembered price.

**Limits**

- **FR-033**: The existing limit on saved products MUST count distinct products across all of a
  shopper's lists. Adding an already-saved product to another list MUST NOT count against it.
- **FR-034**: A save that would exceed the limit MUST be refused with the reason; nothing is ever
  evicted (033 FR-047).

**Existing saved items**

- **FR-035**: Every saved item that exists when this feature is released MUST be in the shopper's
  "Saved" list afterwards, with its position and its remembered price unchanged. Zero may be lost
  or duplicated.

**Guests**

- **FR-036**: A shopper who is not signed in MUST keep exactly one device-held list, behaving as it
  does today. Named lists MUST require sign-in.
- **FR-037**: A guest who asks for a named list MUST be told it needs an account and offered
  sign-in, and MUST NOT lose the save they were making.
- **FR-038**: When a guest signs in or registers, the device's saves MUST join the account's
  "Saved" list under the existing rules (union, disclosed by count, idempotent). No named list is
  changed by the join.

**Measurement and privacy**

- **FR-039**: The platform MUST be able to report how many shoppers create a list, how many
  products are added to named lists, and how often add-all is used from a named list as against
  "Saved".
- **FR-040**: A list's name MUST NOT appear in analytics or in operational logs. It is the
  shopper's own text and may say anything about them.

**Consistency**

- **FR-041**: Creating, renaming, deleting, filling, viewing and acting on lists MUST behave the
  same on customer web and customer mobile. The one existing difference stands: the web search
  results grid carries no heart (033 FR-007 as amended), so it carries no list chooser either.
- **FR-042**: A change to a shopper's lists on one device MUST be reflected on their other devices
  within the window 033 SC-004 sets for saved items.
- **FR-043**: The word "wishlist" MUST NOT appear in any shopper-facing text (033 FR-067). The
  cart's save-for-later capability MUST be untouched (033 FR-003).

### Key Entities *(include if feature involves data)*

- **List**: a named collection of products belonging to one shopper. Has a name, unique among that
  shopper's lists, and an order of its own. One list per shopper is the default list, "Saved",
  which always exists and cannot be renamed or deleted.
- **List entry**: the fact that one product is in one list, and when it was added (which sets its
  position in that list). A product has at most one entry per list and may have entries in several
  lists.
- **Saved product**: a product that is in at least one of a shopper's lists. Carries the price
  remembered from when the shopper first saved it, shared by every list that holds it. Stops
  existing when its last entry is removed. This is what the heart reports and what the saved-product
  limit counts.
- **Device-held saved list**: unchanged from 033. One list on one device for a shopper with no
  account; joins the account's "Saved" list on sign-in.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper can create a list, add five products to it and add all five to the cart in
  one action, in under two minutes from a standing start.
- **SC-002**: After an add-all, 100% of the list's products are still in the list.
- **SC-003**: In 20 out of 20 trials on each customer surface, a product held only in a named list
  shows a filled heart on first display, on the product page, a tile in a grid and a tile in a
  rail.
- **SC-004**: Saving a product from an empty heart takes one action, the same as before this
  feature.
- **SC-005**: A screen of 24 products displays correct heart state for all 24 within 10% of the
  time it took before this feature, for a shopper with 1 list and for a shopper with 20.
- **SC-006**: Of all saved items existing at release, 100% are in their shopper's "Saved" list
  afterwards with the same order and the same remembered price; zero are lost or duplicated.
- **SC-007**: Across 20 trials of deleting a list whose products are also in other lists, zero
  products disappear from any other list.
- **SC-008**: No sequence of heart taps removes a product from a named list without the shopper
  choosing that list, in 20 out of 20 trials.
- **SC-009**: A duplicate name, an over-long name and a list beyond the limit are each refused in
  100% of attempts, including attempts that bypass the customer screens.
- **SC-010**: One shopper's lists can be read or changed by another shopper in zero cases.
- **SC-011**: Zero analytics events and log lines contain the text of any list name.
- **SC-012**: Search results on the web storefront display as fast for a shopper who never opens
  the list chooser as they did before this feature.
- **SC-013**: The same account shows the same lists, names, contents and order on customer web and
  customer mobile.
- **SC-014**: Within a month of release, the share of shoppers who create at least one list and
  the share of carts started by an add-all from a named list are both reportable.

## Assumptions

- **The client means customer-owned lists.** "Add New Category, similar to Favorite" is read as
  lists a shopper creates for themselves, not product categories. ⚠ **Not yet confirmed by the
  client.** If the client meant catalogue categories, this spec is the wrong feature.
- **No starter lists.** A shopper begins with "Saved" only. "Weekly Items" and "Daily Items" may
  be shown as example names where a list is created, but are not created for anyone. ⚠ **An open
  client question**; pre-creating two lists per customer would be a contained change to FR-003.
- **Named lists are still a watchlist.** A named list shows price drops and purchasability like
  "Saved". It is curated by the shopper, never derived from what they bought; "Buy It Again"
  remains a reserved sibling (033 FR-064).
- **One remembered price per product, not per list.** A product showing "was $5" in one list and
  "was $6" in another would be two answers to one question. The first save is the baseline.
- **A filled heart on a product in named lists opens the chooser rather than un-saving.** The
  alternative, one tap removing it from every list, is the destructive second tap 033 was built to
  eliminate.
- **20 lists, 40-character names.** Product levers chosen for a grocery shopper (weekly, daily,
  a few occasions), not structural commitments. The saved-product limits (200 for an account, 50
  on a guest device) are 033's and unchanged.
- **Lists are ordered "Saved" first, then in the order they were created.** Reordering lists by
  hand is not offered.
- **Quantities live in the cart.** A list holds products, not amounts; add-all adds one of each.
- **Deleting a list asks for confirmation and has no undo.** Removing one product from a list
  does have undo, as today.
- **Only signed-in shoppers have named lists**, so every named list belongs to an account and is
  removed when the account is closed.
- **SC-014 is observed, not gated.** It needs live use and does not block sign-off.

### Dependencies

- **Saved items (033)**: the heart, the list row, the purchasability verdict, the remembered
  price, the guest list and its join on sign-in, and the limits. This feature extends all of them
  and replaces FR-066.
- **Cart (027)**: add to cart and add-all use the existing cart and its limits.
- **Customer identity**: named lists need a signed-in shopper; a barred shopper is refused.

## Out of Scope

- Sharing a list with another person, or making one public.
- Scheduled or recurring orders from a list.
- Lists built automatically from purchase history ("Buy It Again").
- Quantities, notes or a manual order for products within a list.
- Reordering the lists themselves by hand.
- Named lists for shoppers who are not signed in.
- Price-drop or back-in-stock notifications (033 FR-063).
- Lists created or curated by Effy, shops or staff.
