# Feature Specification: Customer Storefront Redesign

**Feature Branch**: `084-customer-storefront-redesign`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "Completely redesign the customer website to match the new Effy Storefront
Redesign screens (desktop and phone) and the new Effy Design System. Use the new design's colours,
fonts, logo and components; the old look can be completely removed and replaced. Identify and index
every screen, map it to the current implementation, then implement — including any backend the
screens need."

**Design reference** (the source of truth for appearance, layout and screen states):

- `docs/reference-screens/Effy Storefront Redesign/` — 139 screens in 11 groups, each as a page and a picture.
- `docs/reference-screens/Effy Design System/` — the colour, type, shape and component rules behind them.
- [screen-index.md](screen-index.md) — every reference screen, numbered, mapped to what exists today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One new look on every page (Priority: P1)

A shopper opening any page of the Effy website sees the new identity: the "effy." wordmark with its
green full stop, the new typeface, white pages with light grey lines, blue for actions, green for
savings and for "Delivered by Effy". The header (delivery bar, search, saved, account, cart, aisle
row) and the footer are the same on every shopping page and line up on the same left and right
edges; checkout and sign-in have their own quieter frames. Nothing of the old look remains anywhere.

**Why this priority**: The shared frame and the visual language are what every other screen is built
from. Until they exist no screen can match its reference, and a half-converted site reads as broken.

**Independent Test**: Open each page type on a desktop and a phone and compare against the reference
header, footer, checkout header and sign-in frame; search the site for any element in the old style.

**Acceptance Scenarios**:

1. **Given** any shopping page, **When** it loads on a desktop, **Then** it shows the reference header
   (delivery bar, wordmark, search with aisle chooser, saved, account, cart with total and count,
   aisle row) and the reference footer, aligned to one content column.
2. **Given** any shopping page on a phone, **When** it loads, **Then** it shows the phone header and
   the bottom bar (Home, Aisles, Saved, Orders, Account), and every primary action is comfortably
   tappable.
3. **Given** a signed-in customer with a default address, **When** any shopping page loads, **Then**
   the delivery bar says where Effy is delivering and who delivers there, with a way to change it;
   a guest is invited to say where they are instead.
4. **Given** the customer opens All aisles, the account menu, or the cart, **When** it opens,
   **Then** it appears as the reference menu, dropdown or drawer (a full-height sheet on phones).
5. **Given** any page, **When** an error or destructive action is shown, **Then** it is black with a
   warning icon — no red appears anywhere on the site.

---

### User Story 2 - Find and choose products (Priority: P1)

A shopper lands on home, browses an aisle, searches, filters, and opens a product. Home shows the
offer banner and offer tiles, aisles, deals, offers, aisle rails, new arrivals, brands and recently
viewed. A signed-in shopper also gets a row of shortcuts: their order in progress, their points,
saved items that dropped in price, and buying their last order again. Aisle, search and sale pages
share one listing layout with filters beside the grid (in a sheet on phones). A product is one
page — pictures, price and saving, add to cart, save, add to list, who delivers, then description,
item specifics, allergens and safety, nutrition, and related rails — with no tabs.

**Why this priority**: Browsing is where every order starts and is the most-viewed part of the site.

**Independent Test**: As a guest and as a signed-in customer, go home → aisle → filter → product →
add to cart on desktop and phone, comparing each screen and each state with its reference.

**Acceptance Scenarios**:

1. **Given** a guest on home, **When** the page loads, **Then** it matches "Home — guest"; signed in
   it matches "Home — signed in" including the shortcuts row, each shortcut shown only when it has
   something true to say.
2. **Given** the catalogue is loading, empty, or cannot be reached, **When** home loads, **Then** the
   loading, "shelves are still being stocked" or "couldn't load the store" state is shown.
3. **Given** a listing, **When** the shopper filters or sorts, **Then** the results, the count and the
   active filter chips update, and each filter can be cleared; on a phone the filters open in a sheet.
4. **Given** a search with no matches or a failed search, **When** results would show, **Then** the
   reference no-results or error state is shown with ways onward.
5. **Given** a shopper typing in search, **When** they pause, **Then** suggested searches and matching
   products appear under the field and can be chosen with keyboard or pointer.
6. **Given** a product card anywhere, **When** the shopper adds it, **Then** the Add button becomes
   the quantity stepper in place; an unavailable product says so and cannot be added.
7. **Given** a product page, **When** it loads, **Then** every section the product has information
   for is shown in the reference order, and a section with nothing to show is absent rather than empty.
8. **Given** a signed-in shopper on a product, **When** they choose Add to list, **Then** the list
   chooser opens as the reference dialog, with making a new list in place.

---

### User Story 3 - Cart, checkout and payment (Priority: P1)

A shopper reviews the cart (lines, save for later, promo code, summary with the free-delivery
progress, minimum-order notice), then checks out on one page — address, who delivers and when,
delivery instructions, points, billing, review — then pays, and lands on a confirmation.
Everything the checkout already promises is unchanged: one window for the whole order, an
estimate for courier, the one refusal sentence, the fee shown being the fee charged.

**Why this priority**: This is where money moves. It must look new and behave exactly as before.

**Independent Test**: Place an order to an Effy address with a same-day window, one with a standard
window, and one to a courier address; try an unserviced address; decline a card; abandon a payment.
Compare every state with its reference and the totals with the totals before the redesign.

**Acceptance Scenarios**:

1. **Given** items in the cart, **When** the cart opens, **Then** it matches "Cart" and each line can
   be changed, removed or saved for later; saved-for-later lines can be moved back.
2. **Given** a cart below the minimum, **When** it is shown, **Then** the notice says how much more is
   needed and checkout is unavailable.
3. **Given** the shopper empties the cart, **When** they confirm, **Then** the cart empties and a
   message offers to undo it.
4. **Given** an address Effy delivers to, **When** checkout loads, **Then** today's windows appear
   under "Same-day delivery" and later days under "Standard delivery", closed and full windows are
   shown as such, and choosing one clears any other.
5. **Given** a courier-only address, **When** it is selected, **Then** the estimate and one fee are
   shown with nothing to choose; **Given** an unserviced address, **Then** the one refusal sentence
   is shown and the order cannot continue.
6. **Given** a signed-in shopper with points, **When** they choose to pay with points, **Then** the
   order total is unchanged and the amount to pay by card falls.
7. **Given** the payment step, **When** it loads, **Then** saved cards, a new card, wallets and
   pay-later options the shopper can use are offered inside the reference frame; a decline, a
   payment in progress, and an extra bank check each show their reference state.
8. **Given** a finished payment, **When** the shopper returns, **Then** the confirmation shows paid,
   still confirming, or not completed — each matching its reference.

---

### User Story 4 - Orders (Priority: P2)

A customer sees their orders as a list that shows, for each order, when it was placed, pictures of
what was in it, where it is up to, who delivers it and the total, with View order and Buy again. An
order's page shows its progress, its arrival promise, the receipt, refunds, and what to do if
something is wrong.

**Why this priority**: After buying, tracking is the next most common visit; it does not block buying.

**Independent Test**: With orders in each state (confirmed, on the way, delivered, moved to courier,
refunded) open the list and each order on desktop and phone and compare with the references.

**Acceptance Scenarios**:

1. **Given** past orders, **When** the list loads, **Then** each row shows date, up to a few item
   pictures with a "+N more" count, the order's stage, who delivers, total, and both actions.
2. **Given** no orders, **When** the list loads, **Then** the empty state invites the customer to shop.
3. **Given** an order in any stage, **When** opened, **Then** the progress tracker, arrival wording,
   receipt and refund sections match the reference for that stage, in the order's own sold wording.
4. **Given** an order staff moved to courier, **When** opened, **Then** the notice says it changed.
5. **Given** an order that may still be cancelled, **When** the customer cancels, **Then** the
   confirmation dialog is shown first; **Given** a delivered order, **When** they report a problem,
   **Then** the dialog lets them pick items and a reason.

---

### User Story 5 - Account (Priority: P2)

A signed-in customer has an account area with a side navigation (a list on phones): Overview,
Orders, Saved items & lists, Effy points, Personal info, Address book, Payment methods, Security,
Privacy & data, Legal, Sign out. Overview is new: the order in progress, points, saved items,
default address, default card, recent orders and quick links. Each section is its own page, and
each edit opens beside the page (a drawer on phones).

**Why this priority**: Account upkeep is occasional, but the area is a third of the reference.

**Independent Test**: Visit each section and perform each edit (name, mobile number, address,
password, sign out everywhere, delete account) on desktop and phone against the references.

**Acceptance Scenarios**:

1. **Given** a signed-in customer, **When** they open their account, **Then** Overview shows each
   summary with true information, or its empty wording when there is none.
2. **Given** any account section, **When** opened directly by its address, **Then** it loads with
   the navigation marking where the customer is; old links to sections still arrive there.
3. **Given** the address book, **When** the customer adds, edits, sets default or deletes, **Then**
   each address says who delivers there, and a delete that is not allowed explains why.
4. **Given** Payment methods, **When** opened, **Then** saved cards are listed and removable, and the
   page says cards are added when paying.
5. **Given** Effy points, **When** opened, **Then** the balance, what it is worth, the next expiry and
   the history are shown.
6. **Given** Security, **When** the customer sets or changes a password, or signs out everywhere,
   **Then** each follows its reference steps, including the emailed code where one is required.
7. **Given** Privacy & data, **When** the customer deletes their account, **Then** the code step is
   shown, and a customer with an order in progress is told why they cannot yet.

---

### User Story 6 - Sign in and join (Priority: P2)

A visitor signs in, joins or resets a password inside one centred card: email first, then a code or
a password, or Google. The same card carries every step, the "your cart is saved" note when arriving
from checkout, an expired code, and a failed Google sign-in.

**Why this priority**: Required to check out, but already working; only its appearance changes.

**Independent Test**: Join with a code, join with a password, sign in each of the three ways, and
reset a password, on desktop and phone, comparing each step with its reference.

**Acceptance Scenarios**:

1. **Given** each step of sign-in, join and reset, **When** shown, **Then** it matches its reference
   and all three sign-in routes still reach the same single account.
2. **Given** a visitor sent from checkout, **When** sign-in loads, **Then** the note says the cart is
   saved, and after signing in they return to checkout with it.
3. **Given** an expired code or a failed Google sign-in, **When** it happens, **Then** the reference
   recovery screen is shown with one clear way forward.

---

### User Story 7 - Saved items and lists (Priority: P2)

A customer's saved items show as the reference grid with price-drop and back-in-stock markers,
their named lists alongside, and adding everything to the cart in one action.

**Why this priority**: An existing capability with a new layout; no new behaviour.

**Independent Test**: Save items as a guest, sign in, create a list, move items, add all to cart,
delete the list; compare with the six reference screens.

**Acceptance Scenarios**:

1. **Given** saved items, **When** the page loads, **Then** it matches the reference, with the notice
   when items saved before signing in were merged.
2. **Given** a named list, **When** opened, renamed, or deleted, **Then** each uses its reference
   page or dialog; deleting asks first.
3. **Given** nothing saved, **When** the page loads, **Then** the empty state is shown.

---

### User Story 8 - Offers (Priority: P3)

A shopper can see every current offer in one place, filter them, open one, copy its code, and see
the products it applies to.

**Why this priority**: New to the site and useful for discovery, but nothing depends on it.

**Independent Test**: Publish offers with and without codes and with products; open the Offers
page and each offer on desktop and phone.

**Acceptance Scenarios**:

1. **Given** current offers, **When** the Offers page loads, **Then** each is listed with its title,
   summary and code if any, and the list can be narrowed.
2. **Given** an offer, **When** opened, **Then** its terms, code, how to use it, and the products it
   applies to are shown; an offer with no products shows no empty product section.
3. **Given** an offer that has ended, **When** its address is opened, **Then** the shopper is told it
   is no longer available and pointed to current offers.

---

### User Story 9 - Help and information (Priority: P3)

A shopper can find answers to common questions, search them, and send a message if they still need
help. About, legal documents and their earlier versions, deleting an account, newsletter results,
the not-found page and the error page all take the new look.

**Why this priority**: Supporting pages; low traffic, no purchase depends on them.

**Independent Test**: Open Help, search the answers, send a message (and force a failure); open each
information page and a wrong address, comparing with the references.

**Acceptance Scenarios**:

1. **Given** the Help page, **When** it loads, **Then** answers are grouped by topic and searching
   narrows them; no match offers the message form.
2. **Given** a message, **When** sent, **Then** the sent state is shown; **When** sending fails,
   **Then** the failure state keeps what was typed.
3. **Given** a legal document, **When** opened, **Then** it shows its sections, a contents list, what
   changed, and its earlier versions.
4. **Given** a wrong address or a failure on the site's side, **When** shown, **Then** the reference
   not-found or error page appears with ways onward.

### Edge Cases

- A product, banner or order line with no picture shows the reference placeholder, never a broken image.
- Very long product names, addresses and customer names wrap or shorten without breaking the layout.
- More aisles than the header row can hold: the row stays on one line and the rest are in All aisles.
- A signed-in customer with no address, no points, no saved items and no orders: Overview and the
  home shortcuts show their empty wording or are absent — never placeholder numbers.
- A guest: no points anywhere, no shortcuts row, and the delivery bar invites rather than asserts.
- A window that fills or closes while the customer is choosing is refused and they choose again —
  never swapped for another.
- An order from before delivery types existed shows the day or window it was sold, in its own words.
- Search suggestions that are slow or fail never block typing or submitting the search.
- A browser set to prefer dark still gets the light site.
- Reduced-motion preference: sheets, drawers and carousels appear without animation.
- Old links (account sections by their previous addresses, the addresses page, the feedback page)
  still arrive at the right new page.

## Requirements *(mandatory)*

### Functional Requirements

**The look**

- **FR-001**: Every customer website page MUST match its reference screen in layout, hierarchy,
  spacing, component shape and wording, at desktop and phone widths, and adapt sensibly between them.
- **FR-002**: The site MUST use the reference colour roles only: black text, white pages, grey
  surfaces and lines, Effy blue for actions, links, selection and points, Effy green for the
  wordmark dot, sale and savings, "Delivered by Effy", paid and progress. No red anywhere; errors
  and destructive actions are black with a warning icon.
- **FR-003**: The site MUST use the reference typeface for all text and its companion for codes, and
  the "effy." wordmark wherever the brand appears, including the browser tab icon.
- **FR-004**: The site MUST be light only, whatever the visitor's device preference.
- **FR-005**: Every element of the previous storefront look MUST be removed; no page, state, dialog
  or message may remain in the old style.
- **FR-006**: The new look MUST apply to the customer website only; the shop console, back-office
  and the three mobile apps MUST look exactly as they do today.
- **FR-007**: Every screen state in the reference — loading, empty, error, unavailable, blocked,
  expired — MUST exist for the page it belongs to.
- **FR-008**: Overlays MUST follow the reference pattern: a centred dialog or side panel on desktop
  and a bottom or full-height sheet on phones, closable by keyboard, with focus kept inside.
- **FR-009**: The site MUST NOT show ratings, reviews, stock counts, seller or shop names, the
  number of suppliers filling an order, or points presented as a discount. App store badges say
  "Coming soon" and are not links.

**Nothing that works today may stop working**

- **FR-010**: Every capability the customer website has today MUST remain, behaving the same:
  guest browsing and cart, saved items and lists, promo codes, checkout by Effy window or courier,
  delivery instructions, paying with points, card and wallet payment, saved cards, order history
  and detail, cancellation and refund requests, receipts, the three sign-in routes, password reset,
  profile, addresses, security, account deletion, legal documents and versions, newsletter, feedback.
- **FR-011**: All pinned customer wording MUST stay word-for-word (who delivers, the window and
  courier sentences, the fee lines, the one refusal sentence, the delivery-instruction choices,
  package status words), and an order MUST keep showing the wording it was sold with.
- **FR-012**: Totals, fees, discounts, points and the amount charged MUST be identical to what the
  same cart would have produced before the redesign.
- **FR-013**: Pages MUST keep updating themselves when something they show changes, without the
  customer refreshing and without the page re-checking on a timer.
- **FR-014**: Public pages MUST keep everything search engines and link previews rely on today
  (titles, descriptions, product information, site map), and every existing address MUST keep working.
- **FR-015**: The site MUST stay usable by keyboard and screen reader, with visible focus and visible
  field labels, and text contrast at or above the reference's stated levels.

**What the design adds**

- **FR-016**: The header MUST show a delivery bar: for a customer with a known address, where Effy
  is delivering and who delivers there; otherwise an invitation to say where. It MUST use the same
  single answer checkout uses for that address.
- **FR-017**: The header MUST show the signed-in customer's points balance beside their name, and
  the cart's total and item count.
- **FR-018**: An All aisles menu MUST list every aisle and its sub-aisles (a sheet on phones).
- **FR-019**: Search MUST offer suggestions while typing: suggested searches and matching products.
- **FR-020**: Home for a signed-in customer MUST show shortcuts — order in progress, points and
  their worth, saved items that dropped in price, buy again from the last order — each only when true.
- **FR-021**: Home MUST show a "Shop by brand" row leading to each brand's products.
- **FR-022**: Aisle, search and sale pages MUST share one listing layout with filters beside the
  results on desktop and in a sheet on phones, sort, active filter chips, count and paging.
- **FR-023**: The product page MUST be one page without tabs, and MUST say who delivers to the
  customer's address and, for a signed-in customer, their points.
- **FR-024**: The cart MUST let a customer save a line for later and move it back, and MUST show
  rails for items on sale and items to buy again. A cart drawer MUST open from the header.
- **FR-025**: Emptying the cart MUST ask first and MUST offer to undo afterwards.
- **FR-026**: An Offers page MUST list all current offers, and an offer's page MUST show the
  products it applies to.
- **FR-027**: The order list MUST show, per order, its date, item pictures, stage, who delivers and
  total, with View order and Buy again.
- **FR-028**: The account area MUST have an Overview and one page per section, reached from a side
  navigation on desktop and a list on phones.
- **FR-029**: Overview MUST show the order in progress, points, saved items summary, default address
  with who delivers there, default card, recent orders and quick links.
- **FR-030**: Help MUST show answers grouped by topic, searchable, with the message form beneath.
- **FR-031**: The customer's member-since date MUST be shown on Overview.
- **FR-032**: Changing a mobile number MUST follow the reference panel. Confirming the new number
  with a texted code is NOT part of this feature unless the operator approves it (see Assumptions);
  until then the number is saved as it is today and the code step is not shown.

### Key Entities

- **Reference screen**: one numbered design in the screen index — its group, name, width (desktop or
  phone), the page and state it shows, and what it maps to today.
- **Offer**: a current promotion — title, summary, terms, optional code, optional picture, the aisles
  or products it applies to, and when it ends.
- **Order summary**: an order as shown in a list — number, date placed, stage, who delivers, item
  count, a few item pictures, total.
- **Search suggestion**: a suggested search phrase (optionally within an aisle) or a matching product.
- **Help answer**: a question, its answer, and its topic.
- **Account overview**: the signed-in customer's order in progress, points, saved summary, default
  address, default card and recent orders, gathered for one page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 139 reference screens are accounted for in the screen index, and every one that is
  a page or state of the site is reachable on the running site and judged a match by the operator.
- **SC-002**: A sweep of the customer website finds zero elements in the previous look and zero uses
  of red.
- **SC-003**: Every page is fully usable from 360 to 1920 wide with no sideways scrolling, and every
  primary action on a phone is at least 44 high.
- **SC-004**: For a fixed set of test carts and addresses, the totals, fees and amount charged are
  identical before and after the redesign.
- **SC-005**: A first-time visitor can go from home to a paid order in under three minutes on a phone.
- **SC-006**: Every customer flow that passes today (browse, cart, checkout, pay, orders, account,
  sign-in, saved, newsletter, feedback) still passes after the redesign.
- **SC-007**: The first view of home and of a product page appears as quickly as it does today or
  quicker for a first-time visitor on a typical phone connection.
- **SC-008**: Search suggestions appear within half a second of a pause in typing.
- **SC-009**: The shop console, back-office and mobile apps show no visual difference.
- **SC-010**: No accessibility check that passes today fails after the redesign.

## Assumptions

- **Scope is the customer website.** "Completely remove and replace old things" is read as the
  storefront's own old look. The shop console, back-office and mobile apps are untouched
  (operator, 2026-10-12). The customer mobile app is expected to adopt the same identity in a
  later feature, so the new colours, type and shapes are recorded once, in a form it can take up
  without being re-derived.
- **This departs from current design law and needs it amended first**: the storefront takes its own
  identity (green brand, black for destructive, light only, cards with a soft shadow, card-based
  layouts) where the platform's rules today say one palette for all surfaces, dark mode required,
  cards never shadowed and card layouts avoided. The amendment is part of planning this feature.
- **The reference is the authority for appearance; the platform is the authority for facts.** Where
  a reference screen shows sample content the platform cannot truthfully produce, the element is
  left out rather than invented. Known cases: product pictures are real photos where they exist;
  nutrition and item specifics appear only where the product has them.
- **The reference's known contrast deviation is accepted**: field borders are deliberately light, so
  every field has a visible label and a strong focus ring.
- **Pay-later options and wallets** appear only where the payment provider offers them to that
  customer and device; none is drawn by Effy.
- **Texting a code to verify a mobile number is out** (operator, 2026-10-12) — the platform
  sends codes by email only today, and texting is a new paid outward-facing channel.
- **Help answers are written content** maintained with the site, searched on the page; they need
  the operator's review before launch like other authored prose.
- **Search suggestions** are drawn from the catalogue (product names, brands, aisles), not from what
  other customers searched.
- **No new customer wording is pinned** by this feature; wording that is already pinned is reused.
- **The installed mobile apps are unaffected**: nothing they depend on is removed or changed.
- **Rollout is one switch-over** of the whole storefront in dev, not page by page in front of
  customers, since a half-converted site is the failure this feature exists to avoid.
