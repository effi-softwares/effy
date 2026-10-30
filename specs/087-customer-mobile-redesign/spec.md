# Feature Specification: Customer Mobile Redesign

**Feature Branch**: `087-customer-mobile-redesign`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Customer Mobile Redesign - give the customer mobile app the new storefront
identity designed on the Claude Design canvas, iOS-first, modern and professional like eBay / Uber, while
keeping the app's current behaviour and navigation largely as it is. Every screen on the canvas, plus
foundations, states, micro-animations and page transitions. Cart becomes a tab; no dark top ribbon;
borderless headers; no centred dialogs - bottom sheets for everything with pinned actions; full pages
stacked for content; keep every existing animation and add more; fat-finger friendly; the storefront's
colours, not monochrome. Also fix the defects and fill the data gaps found during the design analysis."

**Design reference** (the source of truth for appearance, layout, motion and screen states):

- Claude Design canvas **"Effy Customer Mobile Redesign"** - https://claude.ai/artifact/WSJRR99YaDrAU6LJaChbQv
  - 40 boards: Foundations, Micro-animations, Page transitions, Product card, App bar, Tab bar, States and
  feedback; and the screens listed under User Story 3.
- Effy design system - https://claude.ai/artifact/2XxzgKFopY2b9ot1fyjuRD - the same identity the
  customer website adopted in 084 (the "storefront identity" in constitution Principle V).
- Customer website (084) - `docs/reference-screens/Effy Storefront Redesign/` and
  `specs/084-customer-storefront-redesign/screen-index.md` - for wording and behaviour parity.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One new look and one app frame (Priority: P1)

A shopper opens the Effy app on an iPhone (or Android phone) and sees the same identity as the Effy
website: white pages, the "effy." wordmark with its green full stop, the Geist typeface, blue for every
action, green for savings, Sale, "Delivered by Effy" and paid. There is no dark band across the top. A
tab's main page has a large bold title on the left (the wordmark on Home) with the notifications bell on
the right, and no line under the header; Home and Search show a light-blue search field under the title.
Along the bottom is a roomy five-tab bar - Home, Search, Cart, Orders, Account - with large icons, clear
labels, the current tab in blue with a blue indicator, and the number of items in the cart on the Cart tab.
Opening anything (a product, an order, a settings page) slides a full page in on top, with a "Back"
control and a centred title, and hides the tab bar; going back slides it away and the tab bar returns.

**Why this priority**: The frame, the colours and the tab bar are what every screen is built from; a
half-converted app reads as broken. It also carries the only navigation change (Cart as a tab).

**Independent Test**: Walk every tab and one pushed page per tab on an iPhone and an Android phone,
compare against the App bar, Tab bar and Foundations boards, and look for any old styling.

**Acceptance Scenarios**:

1. **Given** any tab's main page, **When** it loads, **Then** it shows the large title (the wordmark on
   Home), the bell on the right, no border under the header, no dark band above it, and the five-tab bar.
2. **Given** items in the cart, **When** any tab's main page shows, **Then** the Cart tab carries the
   item count; **When** an item is added, **Then** the badge updates with a short bump.
3. **Given** any tab's main page, **When** the shopper opens a product, an order or an account page,
   **Then** a full page slides in from the right with "Back" and a centred title, and the tab bar is hidden.
4. **Given** a pushed page on iOS, **When** the shopper swipes from the left edge, **Then** the page
   follows the finger and returns to the page below (Android: the system back gesture does the same).
5. **Given** the header, **When** any page shows, **Then** it carries only the title or wordmark, Back,
   and the notifications bell - no cart, search or other buttons.
6. **Given** a tab the shopper had navigated into, **When** they switch away and back, **Then** they
   return to where they were in that tab (each tab keeps its own history, as today); tapping the current
   tab again returns it to its main page.

---

### User Story 2 - Sheets instead of dialogs, and a tactile, animated app (Priority: P1)

Every choice, confirmation and short form appears as a sheet rising from the bottom, with its buttons
pinned at the bottom of the sheet above the home indicator, never as a box in the middle of the screen.
Everything responds to the touch: buttons press in, the "+" on a product becomes a quantity stepper, the
cart badge bumps, loading content shimmers in its final shape, lists refresh when pulled, the large title
shrinks into the header as the page scrolls, and a product picture grows from its tile into the product
page. Every animation the app has today is kept.

**Why this priority**: The operator made "no dialogs", pinned actions and motion binding; together with
User Story 1 they define how every screen behaves.

**Independent Test**: Trigger every confirmation and picker in the app and confirm each is a sheet with
pinned actions; play each animation on the Micro-animations and Page transitions boards and compare.

**Acceptance Scenarios**:

1. **Given** any confirmation (sign out, sign out everywhere, remove an address, delete a list, cancel an
   order, delete the account), **When** it is triggered, **Then** it is a bottom sheet with a grab handle,
   its actions pinned at the bottom, and it closes by dragging down, tapping outside, or its cancel action.
2. **Given** any picker or short form (filters, sort, add to a list, address, personal info, delivery
   window, quantity), **When** it opens, **Then** it is a bottom sheet; a long one grows to full height
   and scrolls under its pinned actions; the keyboard never covers the pinned actions or the field in use.
3. **Given** a product tile with nothing in the cart, **When** the shopper taps "+", **Then** it morphs
   into a stepper showing 1, the cart badge bumps, and the device gives a light haptic tick.
4. **Given** a page that is loading, **When** it shows, **Then** placeholder shapes shimmer in the
   layout of the content to come; **When** the shopper pulls down a list page, **Then** it refreshes.
5. **Given** the device's "reduce motion" setting is on, **When** any transition or animation would
   play, **Then** movement is replaced by a short fade or an instant change, and nothing loops.
6. **Given** any animation the app has today, **When** the redesign ships, **Then** it is still present
   (restyled where needed), and none adds a wait before the shopper can act.

---

### User Story 3 - Every screen in the new design (Priority: P1)

Every screen of the app matches its board on the canvas, with large comfortable touch targets, 16-point
body text and rows about 60 points tall, and primary actions pinned at the bottom of the screen.

Screens: **Discover and shop** - Onboarding, Home, Search tab, Results / aisle, Filters sheet, Product,
Add to a list sheet, Offer. **Cart, checkout and orders** - Cart tab, Checkout (Delivered by Effy),
Checkout (Courier delivery), Payment, Order confirmed, Orders tab, Order details. **Account** - Account
tab, Personal info, Address book, Address sheet, Saved items and lists, Effy points, Payment methods,
Security, Privacy & data, Delete account, Notifications. **Sign in, help and legal** - Sign in (email),
Enter your code, Password sign-in, Join (your name), Help, Give feedback, Legal. **States** - loading,
empty, error, offline, snackbar, consent banner.

**Why this priority**: This is the feature's substance; the operator asked for every screen.

**Independent Test**: For each screen, put the running app beside its board and compare layout, colour,
wording and states; measure touch targets.

**Acceptance Scenarios**:

1. **Given** any screen, **When** it is compared with its board, **Then** layout, colours, type sizes,
   wording and states match, except where this spec or a pinned wording says otherwise.
2. **Given** any tappable element, **When** it is measured, **Then** its touch area is at least 48 × 48
   points, and adjacent targets do not overlap.
3. **Given** the Product, Cart, Checkout and Payment screens, **When** they show, **Then** the primary
   action (add to cart, check out, continue, pay) is pinned at the bottom above the home indicator and
   stays visible while the page scrolls.
4. **Given** checkout for an address Effy delivers to, **When** it shows, **Then** the "Same-day
   delivery" / "Standard delivery" windows, fees and sentences read exactly as they do today; for a
   courier address the estimate and fee read as today; for an address neither serves, the one refusal
   sentence shows.
5. **Given** a screen with no content (empty cart, no orders, no saved items, no notifications),
   **When** it shows, **Then** it shows the board's empty state with one clear next action.
6. **Given** a failure (offline, server error), **When** it happens, **Then** the screen shows the error
   state with a retry, in black with an icon - never red.
7. **Given** the system text size is increased, **When** any screen shows, **Then** text grows, nothing
   is clipped, and pinned actions remain reachable.

---

### User Story 4 - Defects fixed along the way (Priority: P2)

The shopper no longer meets the faults found during the design review.

**Why this priority**: Each is visible to customers and sits on a screen this feature rebuilds anyway.

**Independent Test**: Reproduce each defect on the current app, then confirm it is gone.

**Acceptance Scenarios**:

1. **Given** a placed order, **When** the shopper opens its receipt, **Then** every amount, date and
   name shows its value - no raw placeholder text appears anywhere.
2. **Given** the Effy points page or the Payment methods page, **When** it is open, **Then** it has a
   Back control like every other pushed page.
3. **Given** the Help page, **When** it shows a contact address, **Then** it is hello@effyshopping.com.
4. **Given** a cart filled from several suppliers, **When** the shopper views the cart or checkout,
   **Then** nothing tells them how many suppliers, shops or packages fill the order.
5. **Given** a signed-in shopper, **When** they view the cart, **Then** they are not told they will sign
   in at checkout; a guest still is.
6. **Given** the sign-in screen, **When** the shopper chooses "Continue with Google", **Then** they sign
   in with Google and land in the same single Effy profile as their email sign-in (linked only on a
   Google-verified email), or the option is not shown - never a button that does nothing.

---

### User Story 5 - The information the new screens show (Priority: P2)

The new boards show things the app does not read today: each order on the Orders tab shows where it is
(its stage), when it arrives, and small pictures of its items; an aisle shows its sub-aisles as a row of
choices; the Search tab shows the shopper's recent searches, which they can clear; the Notifications page
lists the shopper's recent notifications.

**Why this priority**: These make the new screens useful rather than decorative, but each screen still
works without them.

**Independent Test**: With orders at different stages, open the Orders tab; open an aisle that has
sub-aisles; search a few times and reopen Search; receive a notification and open Notifications.

**Acceptance Scenarios**:

1. **Given** orders at different stages, **When** the Orders tab loads, **Then** each row shows its stage
   in the one package-status wording, its arrival as it was sold (a window, a day, "as soon as possible"
   with the business's estimate, or a courier estimate - never a promise the order was not sold), and up
   to four item pictures with "+N" for the rest.
2. **Given** an aisle with sub-aisles, **When** it opens, **Then** a row of sub-aisle choices shows above
   the products and choosing one narrows the list; an aisle without sub-aisles shows no row.
3. **Given** the shopper has searched before, **When** they open the Search tab, **Then** their most
   recent searches show (newest first, at most ten) with a way to clear them; they are kept on this
   device only and are removed when the shopper clears them or signs out.
4. **Given** the shopper opens Notifications from the bell, **When** the page shows, **Then** it shows
   the board's design with an honest empty state ("You're all caught up" style, no invented items) and,
   where push permission is off, a way to turn it on. The list of past notifications is **deferred to a
   later feature** (the platform does not keep a customer's sent notifications today).

---

### Edge Cases

- A cart badge with more than 99 items shows "99+"; an empty cart shows no badge.
- A deep link (a notification, a shared product) opens the right page on top of the right tab, with Back
  returning to that tab's main page.
- A sheet open when the app goes to the background is still open, with its input, on return.
- Dragging a sheet with unsaved input asks (in the same sheet) whether to discard before closing.
- Swipe-back is disabled while a payment is being confirmed, and on Order confirmed (which leads forward).
- A long product name, title or price wraps or truncates as on its board; nothing overlaps the bell or Back.
- Small phones (iPhone SE width) and large ones (Pro Max) both show every board's content without
  horizontal scrolling; landscape and tablets keep working, and are not redesigned.
- Pictures that are slow or missing show the grey picture well, never a broken image.
- The shopper turns off notifications permission: the bell and the page still work; the page says so.
- Reduce motion, larger text and a screen reader are all on at once: everything is reachable and announced.

## Requirements *(mandatory)*

### Functional Requirements

**Identity and foundations**

- **FR-001**: The app MUST adopt the storefront identity (constitution Principle V): white ground, black
  text, zinc greys, Effy blue as the only action colour, Effy green for the wordmark's full stop, Sale,
  savings, "Delivered by Effy", paid and progress, and the light-blue tint for search fields and
  selections. No red: errors and destructive actions are black with an icon and their wording.
- **FR-002**: The app's colours, type, corner radii and spacing MUST come from the one storefront token
  source the customer website uses; no colour, size or radius may be declared only in the app.
- **FR-003**: The app MUST use the Geist typeface on every screen, including inside the payment form,
  with no download of fonts at run time.
- **FR-004**: The app MUST show the light appearance only, whatever the device's appearance setting, and
  MUST remove its appearance choice (Light / Dark / System) from Account.
- **FR-005**: The app MUST use the design system's line icons throughout, in the sizes on the Foundations
  board, replacing the current icon set.

**Navigation and frame**

- **FR-006**: The bottom bar MUST have five tabs in this order - Home, Search, Cart, Orders, Account -
  with the sizes on the Tab bar board (large icons, labels, a row at least 58 points tall above the home
  indicator), the current tab in blue with an indicator, and a cart item-count badge on Cart.
- **FR-007**: Cart MUST be reachable only as a tab (it leaves every header); every other route into the
  cart today (after "added to cart", from a product) MUST switch to the Cart tab.
- **FR-008**: Apart from FR-006 and FR-007, navigation MUST stay as it is: the same pages, the same
  per-tab histories, the same deep links, the same guest-first browsing with sign-in when needed.
- **FR-009**: The status-bar area MUST be the page's own white ground - no dark band.
- **FR-010**: A tab's main page MUST show a large bold title (the wordmark on Home) on the left and the
  notifications bell on the right, with no border; it MUST collapse to a compact centred title as the
  page scrolls. Home and Search MUST show the light-blue search field under the title.
- **FR-011**: A page opened on top MUST show a Back control and a centred title, no border, and MUST
  hide the tab bar. Headers MUST carry nothing but title or wordmark, Back, and the bell.
- **FR-012**: Content MUST open as full-size pages stacked on top of each other; nothing that is a page
  on the canvas may be shown as an overlay.

**Sheets**

- **FR-013**: The app MUST NOT show any centred dialog. Every confirmation, choice, picker and short form
  MUST be a bottom sheet with a grab handle and rounded top corners.
- **FR-014**: A sheet's action buttons MUST be pinned at its bottom, above the home indicator and above
  the keyboard; its content scrolls beneath them.
- **FR-015**: A sheet MUST close by dragging down, by tapping outside, or by its cancel action, except
  while it is completing an action; one with unsaved input MUST confirm before discarding.

**Motion**

- **FR-016**: Every transition and animation the app has today MUST remain (restyled where needed).
- **FR-017**: The app MUST provide the transitions on the Page transitions board: push and pop with an
  interactive edge-swipe back on iOS and the system back gesture on Android, sheet presentation and
  dismissal, cross-fade between tabs, large-title collapse, product picture growing from tile to product
  page, and pull to refresh.
- **FR-018**: The app MUST provide the micro-animations on the Micro-animations board, including press
  feedback on every tappable element, "+" morphing into a quantity stepper, the cart badge bump, skeleton
  shimmer, number roll on totals, success tick on order confirmed, and snackbar entry, with the timings
  on that board.
- **FR-019**: When the system's reduce-motion setting is on, movement MUST be replaced by a fade or an
  instant change; no animation may delay input.
- **FR-020**: Adding to cart, changing quantity and confirming an order MUST give a light haptic response
  where the device supports it.

**Touch and readability**

- **FR-021**: Every tappable element MUST have a touch area of at least 48 × 48 points; body text MUST be
  16 points; list rows MUST be about 60 points tall; text fields MUST be at least 48 points tall with
  16-point text.
- **FR-022**: The primary action on Product, Cart, Checkout, Payment and every form page MUST be pinned
  at the bottom above the home indicator.
- **FR-023**: Every screen MUST honour the system text size, keep WCAG AA contrast for text, label every
  field visibly, and give every control a screen-reader name.

**Screens**

- **FR-024**: Every screen listed in User Story 3 MUST match its board in layout, colour, type, wording and
  states (loading, empty, error, offline where the board shows them).
- **FR-025**: Delivery wording MUST remain exactly as pinned today: the coverage refusal sentence, the
  Effy windows view's words, the delivery-type words and summaries, and an order's arrival as sold. The
  redesign changes how they look, never what they say.
- **FR-026**: Things the app deliberately does not offer today (ratings, size pickers, card-number fields
  in the app) MUST stay absent.
- **FR-027**: A product card MUST show its picture, name, size, price, and Sale / savings in green, and an
  overlay "+" that becomes a stepper once the product is in the cart (Product card board).

**Defects**

- **FR-028**: The receipt MUST show values, never placeholder text.
- **FR-029**: Effy points and Payment methods MUST have a Back control.
- **FR-030**: Help MUST show hello@effyshopping.com as the contact address and no other.
- **FR-031**: Cart and checkout MUST NOT reveal how many suppliers, shops or packages fill an order.
- **FR-032**: The "you'll sign in at checkout" message MUST show only to guests.
- **FR-033**: "Continue with Google" MUST sign the shopper in to their one Effy profile (linking only on a
  Google-verified email), or MUST NOT be shown.

**Information the new screens need**

- **FR-034**: Each Orders-tab row MUST show the order's stage in the one package-status wording, its
  arrival as sold, and up to four item pictures with "+N".
- **FR-035**: An aisle with sub-aisles MUST show them as a row of choices that narrows its products.
- **FR-036**: The Search tab MUST show up to ten recent searches, newest first, kept only on the device,
  removable one by one or all at once, and cleared on sign-out.
- **FR-037**: The bell MUST open Notifications; the page MUST show the board's design and an honest empty
  state; the list of past notifications is deferred (User Story 5, scenario 4).

### Key Entities

- **Recent search**: text the shopper searched for, and when; kept on the device only, at most ten.
- **Order summary (as listed)**: an order's number, stage, arrival as sold, total, and up to four item
  pictures with a count of the rest.
- **Sub-aisle**: an aisle inside an aisle, with its name and position.
- **Customer notification** (deferred - not built in this feature).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the screens listed in User Story 3 are signed off against their boards by the
  operator on an iPhone and an Android phone.
- **SC-002**: Zero centred dialogs remain in the app; every confirmation and picker is a sheet whose
  actions are visible with the keyboard open.
- **SC-003**: 100% of tappable elements measure at least 48 × 48 points on the smallest supported phone.
- **SC-004**: Zero colours, sizes or radii in the app that do not come from the shared storefront tokens;
  zero uses of red; zero dark-appearance screens.
- **SC-005**: Every animation present before the redesign is still present after it, and every animation
  on the Micro-animations and Page transitions boards is present; each runs smoothly (no visible stutter)
  on a three-year-old phone, and none plays with reduce motion on.
- **SC-006**: A shopper can go from opening the app to an order placed in no more taps than today.
- **SC-007**: All six listed defects are reproducible before and absent after.
- **SC-008**: Every pinned delivery wording test passes unchanged.

## Assumptions

- **Light only is not a constitution change.** Principle V (v3.3.0) already says the customer mobile app
  moves to the storefront identity in a later feature and that identity is light only; this is that
  feature. The constitution's dark-mode requirement continues to bind the consoles and the driver and
  shop apps.
- On the storefront identity, card layouts are permitted (Principle V); the boards' bordered cards for
  addresses, summaries and delivery choices are therefore allowed.
- The Product page keeps a pinned "Add to cart" bar at the bottom (as on its board), since the operator
  asked for primary actions to be pinned.
- iOS is the reference for look and motion; Android gets the same design with its own system back
  gesture, and is not given separate Material styling.
- Tablet and landscape layouts keep working as they do today and are not redesigned in this feature.
- Pictures come from the catalogue picture service (086); this feature does not change how pictures are
  stored or served.
- Payment entry stays in the payment provider's own sheet; only its colours and typeface are themed.
- Existing analytics events keep their names; a new tab (Cart) is recorded as a new screen view.
- The customer website, the driver and shop apps, and every delivery rule are out of scope.
- The operator walks and signs off the app; this feature does not publish it to the app stores.
