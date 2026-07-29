# Feature Specification: Customer Experience Refresh (Web + Mobile)

**Feature Branch**: `[025-customer-ui-refresh]`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "I want to update the customer app UIs in both web and mobile apps. Current UI is not modern and professional. Make it look like eBay / Uber Eats — at parity across both customer surfaces."

## Context

The customer audience is the only public one. Both of its surfaces are functionally complete — a shopper can discover, add to cart, pay, and track an order — but the presentation was built incrementally alongside the commerce plumbing and has never had a dedicated design pass. The result reads as scaffolding rather than a product:

- **The only primary navigation entry on the web storefront is a dead end** — it shows a "shelves are still being stocked" placeholder even though the store has real products behind search and the home rails.
- **Delivery is invisible until checkout.** The platform has known delivery zones, service levels, and per-zone pricing, but a shopper cannot see whether Effy delivers to them, or what it costs, until after they have chosen items and signed in.
- **The mobile app's primary navigation is labelled with the first letter of each destination** — "H", "S", "O", "A". There are no app bars, no product images in the cart, no loading skeletons, no pull-to-refresh, and no confirmation feedback when an item is added.
- **The two surfaces do not share a typeface**, so the same brand reads differently depending on the device.
- Product tiles are laid out at a fixed width but reused inside a fluid results grid, so search results do not fill the available space.

The shop operator audience already went through this exercise: its mobile surface was reset onto a deliberate presentation foundation — real iconography, a typographic scale, a spacing rhythm, safe-area handling, responsive navigation, and motion with a reduced-motion path. The customer audience never received the equivalent, and the customer surfaces are the ones the public sees.

This feature is that pass, for both customer surfaces, kept at parity.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find Something to Buy (Priority: P1)

A shopper arrives with no account and wants to see what Effy sells, whether Effy delivers to their address, and how to narrow a large catalogue down to the few things they actually want — without being asked to sign in and without hitting a dead end.

**Why this priority**: Discovery is the top of every commerce funnel and it is where the current experience fails hardest. The single navigation entry leads nowhere, delivery availability is hidden until after the cart is built, and refinement is limited to one on/off toggle. Nothing downstream can succeed if a shopper cannot find a product or does not believe Effy serves them.

**Independent Test**: As a guest on both surfaces, open the storefront cold, set a delivery location, reach a category from primary navigation, refine a result set down with more than one criterion, and arrive at a product — never encountering a placeholder page or a sign-in prompt.

**Acceptance Scenarios**:

1. **Given** a guest on either surface, **When** they open the storefront, **Then** they see merchandised content, a persistent way to search, a persistent way to reach categories, and a persistent delivery-location affordance — with no sign-in prompt anywhere in the path.
2. **Given** a guest selects the primary browse entry, **When** the browse experience loads, **Then** they see the store's real category structure with representative imagery and can enter any category, and no "coming soon" or "being stocked" placeholder is reachable while the catalogue has products.
3. **Given** a shopper in a category or search result, **When** they refine by more than one criterion at once, **Then** the result set updates, every active refinement is visible as a removable control, and a single action clears all of them.
4. **Given** a shopper has refined a result set, **When** they open a product and return, **Then** their refinements, scroll position, and place in the result set are preserved.
5. **Given** a shopper sets a delivery location, **When** they continue shopping and return later in the same session or on a later visit, **Then** the location persists and is shown wherever delivery is framed.
6. **Given** a shopper sets a location Effy delivers to, **When** the location is accepted, **Then** they are told so immediately, before any cart exists.
7. **Given** a shopper sets a location Effy does not deliver to, **When** the location is accepted, **Then** they are told so plainly and offered a way to change it, browsing continues to work, and the same answer is given at checkout.
8. **Given** a shopper is viewing a result set, **When** they change the sort order, **Then** the results reorder from the start, the active ordering and the total number of matches are both visible, and no product is lost or repeated as they page onward.
9. **Given** a search returns nothing, **When** the empty result is shown, **Then** it explains why in plain language and offers at least one recovery path rather than an unexplained blank area.
10. **Given** promotional content exists, **When** the storefront home is shown, **Then** it is presented as a real merchandising surface with imagery and, where more than one promotion exists, a way to move between them — not a single flat coloured block of text.
11. **Given** any result grid on any supported viewport, **When** it renders, **Then** product tiles fill the grid consistently with no visible gaps caused by fixed-width tiles in a fluid layout.

---

### User Story 2 - Decide On a Product (Priority: P2)

A shopper who has landed on a product wants to see it properly, understand exactly what it is, know when it would arrive, choose how many, add it, and see what else is like it — without leaving the page to answer any of those questions.

**Why this priority**: The product page is where the buying decision is made. It currently shows a single non-interactive image with inert thumbnails, a price, and a button — carrying less information than any comparable consumer commerce product, and giving no delivery expectation at the moment the shopper is deciding.

**Independent Test**: Open a product with several images and several attribute groups on both surfaces, view every image, read the full specifics, see a delivery expectation, choose a quantity, add it, and move to a related product — all without leaving the product experience.

**Acceptance Scenarios**:

1. **Given** a product with multiple images, **When** the shopper selects any thumbnail, **Then** the main image changes to it, and on a touch surface the images can also be swiped through with position clearly indicated.
2. **Given** a shopper viewing a product with a delivery location set, **When** the page renders, **Then** a delivery expectation is shown near the price.
3. **Given** a shopper viewing a product with no delivery location set, **When** the page renders, **Then** they are invited to set one in order to see delivery information, and the absence of one never blocks adding the item to the cart.
4. **Given** a shopper viewing a product, **When** they choose a quantity, **Then** the quantity control is adjacent to the add action rather than separated from it, and the resulting line total is unambiguous.
5. **Given** a shopper scrolls a long product page on a touch surface, **When** the primary action would scroll out of view, **Then** the price and add action remain persistently reachable without scrolling back.
6. **Given** a product belongs to a category with other products, **When** the shopper reaches the end of the product content, **Then** they are offered related products from that category, excluding the one they are viewing.
7. **Given** a product has structured specifics, **When** they are displayed, **Then** they are readable as grouped label/value rows that stay legible at the narrowest supported width.
8. **Given** a product is unavailable, **When** it is displayed, **Then** the unavailability is stated clearly at the point of action rather than only as an overlay on the image, and the shopper is offered an alternative path.

---

### User Story 3 - Use a Mobile App That Feels Native (Priority: P3)

A shopper on a phone or tablet expects the app to behave like every other app on their device: recognisable icons, a title bar that says where they are and how to go back, content that respects the device's edges and notches, something to look at while data loads, a way to refresh, and a clear response to every tap.

**Why this priority**: The mobile surface is where the gap between Effy and its reference platforms is widest and most immediately visible. Lettered navigation glyphs, text-button back links, and a spinner-only loading state are read by shoppers as an unfinished or untrustworthy app — a direct risk to conversion on the platform's most personal surface.

**Independent Test**: Install and use the customer app on a small phone, a large phone, and a tablet in both orientations; visit every destination; trigger loading, empty, error, and offline states; and confirm every one is recognisable, safe-area correct, and gives feedback — with no lettered glyph or ad-hoc text control remaining.

**Acceptance Scenarios**:

1. **Given** the mobile app's primary navigation, **When** it is displayed, **Then** every destination shows a meaningful production-quality icon with a persistent text label, and no letter placeholder is reachable anywhere in the app.
2. **Given** any destination or nested screen, **When** it is displayed, **Then** it presents a title bar that names the screen and, where the screen was pushed onto a stack, offers a standard back affordance — not an improvised text link.
3. **Given** any screen on a device with a status bar, cutout, rounded corners, or gesture navigation, **When** it is displayed, **Then** essential content and controls remain within safe areas and system status information remains legible.
4. **Given** content is loading for the first time, **When** the shopper waits, **Then** they see a placeholder representing the shape of the content that is coming, rather than an unexplained spinner on an empty screen.
5. **Given** a shopper is viewing a list of content, **When** they pull down from the top, **Then** the content refreshes with a visible progress indication and the shopper's position is preserved on completion.
6. **Given** a shopper adds an item, saves a favourite, or an action fails, **When** the outcome is known, **Then** a transient message confirms it and, where a follow-up is useful, offers one action.
7. **Given** the cart contains items, **When** the shopper views it, **Then** every line shows the product's image alongside its name, price, quantity control, and line total.
8. **Given** the shopper changes orientation, resizes a window, or changes text size, **When** the layout adapts, **Then** their destination and place in it are preserved and no control becomes clipped or unreachable.
9. **Given** the device has reduced-motion enabled, **When** transitions and feedback occur, **Then** movement is removed or simplified without removing the state change itself.

---

### User Story 4 - Add to Cart and Check Out With Confidence (Priority: P4)

A shopper adding items wants unmistakable confirmation that it worked, an easy way to see what is in the cart without losing their place, and a checkout where the amount they will pay stays visible while they work through the steps.

**Why this priority**: The current flow is functionally correct but silent — adding an item produces almost no acknowledgement, and on wide screens the order summary scrolls away from the form it belongs to. Both are known causes of duplicate adds and abandoned checkouts.

**Independent Test**: Add several items from different places on both surfaces, confirm each add is acknowledged, review the cart without losing the browsing position, and complete a checkout on a wide screen with the amount payable visible throughout.

**Acceptance Scenarios**:

1. **Given** a shopper adds an item from anywhere, **When** the add succeeds, **Then** it is acknowledged immediately, the cart indicator reflects the new count, and a path to the cart is offered without forcing navigation.
2. **Given** a shopper on a wide screen wants to review the cart, **When** they open it from the header, **Then** they can review and adjust its contents without losing the page they were on.
3. **Given** a shopper adjusts a quantity or removes a line, **When** the change is applied, **Then** the totals update visibly and a removal can be undone from the same acknowledgement.
4. **Given** a shopper is in checkout on a wide screen, **When** they scroll through the steps, **Then** the order summary — items, delivery, and total — remains visible.
5. **Given** a cart whose items will arrive in more than one package, **When** it is displayed, **Then** the split is explained in plain language, no fulfilment location is ever named or implied, and a single-package cart shows no artificial package framing.
6. **Given** an empty cart, **When** it is displayed, **Then** it offers a direct route back into the catalogue rather than a dead end.

---

### User Story 5 - Experience One Coherent, Accessible Brand (Priority: P5)

A shopper who uses the web storefront on a laptop and the app on a phone experiences one product — the same typeface, the same colour meanings, the same light and dark behaviour, the same tone — and can use either one with assistive technology, larger text, or a keyboard alone.

**Why this priority**: Coherence and accessibility are what separate a professional product from a competent one, and the two surfaces currently diverge on something as basic as the typeface. This story is last only because it is verified across the work the earlier stories produce.

**Independent Test**: Review every screen touched by this feature on both surfaces in light and dark appearance, at increased text size, with a screen reader, and — on the web — by keyboard alone, and confirm one visual system and no accessibility blocker.

**Acceptance Scenarios**:

1. **Given** the same content on both surfaces, **When** it is compared side by side, **Then** it uses the same typeface, the same type hierarchy, the same spacing rhythm, and the same colour meanings.
2. **Given** any screen introduced or changed by this feature, **When** it is viewed in light and in dark appearance, **Then** every visible colour comes from the shared design vocabulary, with no improvised or hardcoded value.
3. **Given** the appearance preference is changed while the shopper is using either surface, **When** the change applies, **Then** every affected screen updates without losing the shopper's place.
4. **Given** a shopper using a screen reader, **When** they traverse discovery, product detail, cart, and checkout, **Then** every control is labelled, reading order is logical, and dynamic updates such as result counts, refinements, and add confirmations are announced.
5. **Given** a shopper using the web storefront by keyboard alone, **When** they traverse any screen changed by this feature, **Then** every interactive element is reachable, focus is always visible, and no focus trap exists.
6. **Given** any status, badge, refinement, or availability meaning, **When** it is displayed in grayscale, **Then** its meaning remains understandable without relying on colour alone.
7. **Given** a shopper increases system text size to the supported maximum, **When** any screen is displayed, **Then** text remains readable and no control becomes clipped or unreachable.

### Edge Cases

- A shopper's delivery location falls outside every serviced area, or they enter an invalid or ambiguous one.
- A shopper changes their delivery location while items are already in the cart.
- The catalogue is genuinely empty, or a category contains no products.
- A category tree is one level deep, extremely wide, or has categories with no imagery.
- A product has no image, exactly one image, or many images; a related-products rail would be empty.
- A refinement combination produces zero results while other refinements would produce many.
- A shopper opens a shared link to a refined result set, or navigates back and forward through several refinement changes.
- Product names, brands, and category names that are very long, or written in a script that changes line height.
- Network loss mid-scroll on an infinite result set, or a refresh that fails.
- The shopper taps a destination or an add action repeatedly during a transition.
- Appearance changes between light, dark, and system-following while either surface is open.
- A very small phone in landscape with the keyboard open; a large tablet in landscape.
- A shopper with a very large cart, or a cart split across many packages.

## Requirements *(mandatory)*

### Doctrine and Boundaries

- **FR-001**: This feature MUST change only how the customer experience is presented; existing commerce behaviour, pricing, delivery quoting, payment, order handling, authorisation, and stored data MUST remain unchanged.
- **FR-001a**: Exactly two new read capabilities are authorised by this feature, both public and both read-only: an up-front **serviceability answer** for a delivery location (FR-014) and **ordering plus a total count** for a result set (FR-016). No other server capability MUST be added; where a desired presentation cannot be truthfully served by an existing capability or by these two, the presentation MUST be reduced rather than the boundary widened.
- **FR-001b**: Neither new capability MUST write data, require an account, expose any fulfilment detail, or return anything a shopper could not already obtain by reaching checkout.
- **FR-002**: Both customer surfaces MUST be delivered at parity — every capability introduced here MUST exist on both, expressed natively for each, and the customer parity register MUST be updated to record it.
- **FR-003**: The guest-first rule MUST hold: every discovery and evaluation capability introduced here MUST be fully usable without an account, and sign-in MUST be requested only where it already is today.
- **FR-004**: The visual direction MUST take its cues from Uber Eats' delivery-framed, task-first discovery and eBay's information-rich product and search patterns, adapted to Effy's single-brand, hidden-fulfilment model and its own brand identity; it MUST NOT reproduce either product's branding, layout, assets, or trade dress.
- **FR-005**: Card-style containers MUST NOT be introduced as a general layout device; product tiles remain the single recorded exception, and product specifics, cart lines, order lines, and detail rows MUST remain tables, lists, or rows.
- **FR-006**: No fulfilment location MUST ever be named, numbered, or made inferable to the shopper on any surface introduced or changed here.
- **FR-007**: Every colour, type size, spacing step, and corner radius MUST come from the shared design vocabulary; no improvised or hardcoded value is permitted.
- **FR-008**: Every screen introduced or changed MUST support light and dark appearance and MUST respond to the existing runtime appearance preference without losing the shopper's place.

### Discovery

- **FR-009**: The web storefront MUST replace its placeholder browse page with a working category experience showing the store's real category structure, and no placeholder page MUST remain reachable from primary navigation while the catalogue has products.
- **FR-010**: ~~The mobile app MUST provide an equivalent category browse experience reachable from its primary navigation.~~
  **⚠ SUPERSEDED 2026-07-30 (operator instruction, during 026).** The Browse destination was removed
  from customer-mobile along with `BrowseScreen.kt`/`BrowseViewModel.kt` and its route; the tab set is
  now **Home · Search · Orders · Account**. Mobile's remaining category affordance is the Discover rail
  chips, which group the home read client-side — narrower than a category index. **FR-009 (web) still
  stands**; `/browse` on customer-web is untouched, so this is a deliberate, recorded parity gap rather
  than a platform-wide reversal. See `docs/audiences/customer-capabilities.md` § Category browse.
- **FR-011**: A search entry MUST be persistently available from the storefront chrome on both surfaces, without requiring the shopper to first navigate to a dedicated search destination.
- **FR-012**: Both surfaces MUST provide a persistent delivery-location affordance in the storefront chrome that lets a shopper set, see, and change the location their delivery information is framed around.
- **FR-013**: The delivery location MUST persist across the session and across visits on the same device, MUST be available to guests without an account, and MUST reuse a signed-in shopper's existing default address where one exists.
- **FR-014**: When a shopper sets a delivery location, the storefront MUST tell them immediately whether Effy delivers there, before any cart exists. A location Effy does not serve MUST be stated plainly, without blame, and MUST offer a way to change it; it MUST NOT block browsing, and it MUST NOT be the shopper's first discovery of the fact at checkout.
- **FR-014a**: The up-front serviceability answer MUST be limited to whether the location is served. Delivery price and delivery window MUST NOT be quoted before checkout, because both depend on cart contents and would otherwise commit Effy to a figure it then revises.
- **FR-014b**: Serviceability MUST be decided by the same delivery zones and service levels that decide it at checkout, so the two answers can never disagree.
- **FR-015**: Result sets MUST support refinement by category, by price range, and by promotional status, with every active refinement shown as an individually removable control plus a single action that clears all of them.
- **FR-016**: Result sets MUST expose a sort control offering at least relevance, price ascending, price descending, and newest, with the active ordering always visible and the default stated.
- **FR-016a**: Result sets MUST show the total number of matching products, and that total MUST reflect every active refinement.
- **FR-016b**: Changing the sort order or any refinement MUST return the shopper to the start of the result set, MUST NOT interleave results from a previous ordering, and MUST NOT lose or duplicate products across a paged result set.
- **FR-016c**: Where a total cannot be produced within the storefront's responsiveness expectations, an explicit approximation MUST be shown rather than a precise-looking wrong number.
- **FR-017**: Refinements MUST be expressed so that a refined result set can be shared and reopened as a link on the web storefront, and MUST NOT change the discovery pages' existing crawlability or caching characteristics.
- **FR-018**: Returning from a product to a result set MUST restore the shopper's refinements and their position in the results.
- **FR-019**: Promotional content on the storefront home MUST be presented as a merchandising surface capable of imagery and of more than one promotion, with clear position indication and manual control when more than one exists.
- **FR-020**: Product tiles MUST fill their container in fluid layouts and MUST maintain a consistent width in horizontally scrolling rails, at every supported viewport width.
- **FR-021**: Every loading, empty, error, and offline state in discovery MUST be explicit, written in plain language, and MUST offer at least one recovery action.

### Product Evaluation

- **FR-022**: Product images MUST be interactive on both surfaces — selectable thumbnails on pointer devices, swipeable with position indication on touch devices — and MUST degrade gracefully for products with one image or none.
- **FR-023**: A delivery expectation MUST be shown adjacent to the price when a delivery location is known, and an invitation to set one MUST be shown when it is not; neither state MUST block adding the item to the cart.
- **FR-024**: The quantity control MUST sit adjacent to the primary add action.
- **FR-025**: On touch surfaces, the price and primary add action MUST remain persistently reachable while the shopper scrolls a long product page.
- **FR-026**: Product detail MUST offer related products drawn from the product's own category, excluding the product being viewed, and MUST be omitted entirely rather than shown empty when there are none.
- **FR-027**: Product specifics MUST be presented as grouped label/value rows that remain legible at the narrowest supported width.
- **FR-028**: Unavailability MUST be communicated at the point of action, not only as an image overlay.

### Mobile Presentation

- **FR-029**: Every mobile navigation destination MUST use a meaningful production-quality icon with a persistent text label; letter placeholders are prohibited anywhere in the customer app.
- **FR-030**: Every mobile screen MUST present a title bar naming the screen, and every pushed screen MUST offer a standard platform back affordance; improvised text-link navigation controls are prohibited.
- **FR-031**: Every mobile screen MUST respect device safe areas — status bars, cutouts, rounded corners, gesture areas, and the keyboard — with system status information remaining legible.
- **FR-032**: First-load states on mobile MUST present a placeholder representing the shape of the incoming content rather than an unexplained spinner.
- **FR-033**: Scrollable content lists on mobile MUST support pull-to-refresh with visible progress and preserved position.
- **FR-034**: Mobile MUST provide transient confirmation for adds, saves, removals, and failures, with at most one follow-up action offered.
- **FR-035**: Mobile cart lines MUST show the product image alongside name, unit price, quantity control, and line total.
- **FR-036**: Mobile touch targets MUST meet the platform's minimum size expectation, and interactive controls MUST give press feedback.
- **FR-037**: Mobile transitions and feedback MUST honour the device's reduced-motion setting by simplifying or removing movement without removing the state change.
- **FR-038**: The mobile app MUST render the platform typeface, matching the web storefront.

### Cart and Checkout

- **FR-039**: Adding an item MUST be acknowledged immediately on both surfaces, the cart indicator MUST reflect the change, and a path to the cart MUST be offered without forcing navigation.
- **FR-040**: The web storefront MUST let a shopper review and adjust the cart from the storefront chrome without leaving the page they are on.
- **FR-041**: Quantity changes and removals MUST update totals visibly, and a removal MUST be reversible from its own acknowledgement.
- **FR-042**: On wide screens, the checkout order summary MUST remain visible while the shopper works through the steps.
- **FR-043**: Multi-package carts MUST continue to explain the split in plain language with positional labelling only, and single-package carts MUST show no package framing.
- **FR-044**: Empty cart, empty favourites, and empty order-history states MUST each offer a direct route back into the catalogue.

### Accessibility and Verification

- **FR-045**: Every interactive element on both surfaces MUST carry an accessible name, and dynamic changes — result counts, applied refinements, add confirmations, and errors — MUST be announced to assistive technology.
- **FR-046**: The web storefront MUST be fully operable by keyboard alone, with a visible focus indicator on every interactive element and no focus trap.
- **FR-047**: All status, badge, refinement, and availability meanings MUST remain understandable without colour.
- **FR-048**: Both surfaces MUST remain usable at the platform's supported maximum text size with no clipped or unreachable control.
- **FR-049**: The web storefront MUST NOT regress its existing guest page-weight budget, its server-rendered-shell behaviour, or its search-engine visibility.
- **FR-050**: Existing automated checks covering commerce behaviour, session handling, appearance switching, brand-asset integrity, and cross-surface drift MUST continue to pass unchanged.

## Key Entities

- **Delivery context**: the location a shopper's delivery information is framed around — held per device for guests, and derived from the default saved address for signed-in shoppers. It is a presentation concern: it changes what the shopper is told about delivery, never what they are charged, which remains decided at checkout.
- **Category view**: a browsable presentation of the store's existing category structure, acting as an entry point into refined result sets. It introduces no new catalogue concept and no new taxonomy.
- **Refinement set**: the combination of criteria narrowing a result set, expressed so it can be shared, reopened, individually removed, and cleared as a whole.

## Visual Direction and Reference Findings

- **Uber Eats influence**: delivery framed up front rather than at the end — location, then search, then cart, in that order of prominence; large tappable imagery; task-first hierarchy; strong typography over container chrome; a persistent, unmissable primary action on decision screens.
- **eBay influence**: information-dense but scannable results; refinement as a first-class, always-visible control rather than a hidden panel; structured item specifics as grouped rows; product pages that answer delivery, quantity, and availability without navigation. eBay's own recent direction moved *away* from heavy card chrome toward quieter, denser surfaces — which aligns with Effy's existing no-card doctrine rather than conflicting with it.
- **Effy adaptation**: a single-brand, hidden-fulfilment grocery store. There are no storefronts to compare and no sellers to rate, so discovery must lean on category structure, promotions, delivery certainty, and product quality rather than on seller signals. Food and food-related products take priority in merchandising.
- **Precedent inside the platform**: the shop mobile surface has already been reset onto a deliberate presentation foundation — real iconography, a typographic scale, a spacing rhythm, safe-area handling, responsive navigation, and motion with a reduced-motion path. The customer surfaces should inherit that foundation rather than reinvent it, and where it is currently specific to one audience it should be made shared.
- **Rejected directions**: card-tiled dashboards, metric tiles, lettered or ambiguous glyphs, filled brand-colour blocks standing in for merchandising, spinner-only loading, silent state changes, and refinement hidden behind a modal on wide screens.

## Scope

### In Scope

- Presentation of the customer web storefront and the customer mobile app: discovery, category browse, search and refinement, product detail, cart, checkout layout, favourites, order list and receipt, and the storefront chrome on both.
- A working category browse experience replacing the current placeholder.
- A persistent search entry and a persistent delivery-location affordance in the chrome of both surfaces.
- Two new public read capabilities, and only these two: an up-front serviceability answer for a delivery location, and ordering plus a total count for a result set.
- A mobile presentation foundation for the customer app: iconography, title bars, safe areas, skeletons, pull-to-refresh, transient feedback, press feedback, motion with a reduced-motion path, and the platform typeface.
- Sharing the shop audience's existing mobile presentation foundation across both mobile surfaces where it is currently audience-specific.
- Accessibility across everything this feature touches.
- Updating the customer parity register.

### Out of Scope

- Any change to commerce behaviour, pricing, delivery quoting, payment, order state, or authorisation.
- New catalogue concepts: no new taxonomy, no product relationships beyond what the existing category structure already provides, no ratings, reviews, or seller signals.
- The driver mobile app, the shop web console, the shop mobile app's feature screens, and the back-office console — except where a shared foundation is extracted and those surfaces are refactored onto it with no behaviour change.
- Cloud deployment of the hot path, which remains its own slice.
- Reproducing Uber Eats or eBay branding, layouts, assets, or trade dress.

## Dependencies

- The existing customer catalogue, search, cart, checkout, delivery-quoting, favourites, and order capabilities, all of which remain unchanged.
- The existing shared design vocabulary — colour roles, typography, spacing, and radius — as the single source of truth, together with the runtime appearance preference.
- The existing brand assets and their generation and drift-checking workflow.
- The existing shop mobile presentation foundation, which this feature generalises rather than duplicates.
- The existing delivery zones and service levels, which supply what the delivery affordance can truthfully say.
- The existing customer parity register, which records web/mobile parity for this audience.

## Assumptions

- "Modern and professional" means the reference-platform patterns above applied to Effy's own brand — not a rebrand. Brand colours, the mark, and the accent doctrine are unchanged by this feature.
- Category browse presents the catalogue's existing category structure. It introduces no new taxonomy and does not change how categories are administered.
- Related products are derived from the product's existing category rather than from any new relationship or recommendation capability.
- A guest's delivery location is a device-local preference. It is not an account record, is not shared between devices, and does not become one until the shopper saves an address in the normal way.
- Refinements remain expressed as query parameters rather than as page paths, preserving the storefront's existing crawl and cache policy.
- This feature is presentation-only with two deliberate, bounded exceptions (FR-001a): an up-front serviceability answer and result ordering with a total count. Both were chosen because the experience they enable — knowing Effy delivers to you before you shop, and knowing how many results you are looking at and in what order — cannot be faked in presentation without lying to the shopper. Everything else stays inside existing capabilities.
- Up-front serviceability is deliberately narrower than a quote. It answers "do we deliver here", not "what will it cost" — so the storefront never shows a number that checkout then changes.
- A total count is expected to stay inexpensive at the platform's current catalogue size. If it ever stops being so, FR-016c permits an explicit approximation rather than removing the signal.
- Verification of visual and interaction quality is a structured review across a defined set of viewports and appearances, plus the existing automated checks; it is not left to per-screen judgement.
- Delivering all five stories is preferred, but each is independently shippable in priority order, and Story 1 alone materially improves the storefront.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A guest starting from a cold storefront reaches a specific product through category browse — without using search and without signing in — in at most three deliberate steps on both surfaces, and encounters no placeholder page at any point.
- **SC-002**: In moderated testing, at least 90% of shoppers correctly state whether Effy delivers to their address before they add anything to the cart, on both surfaces.
- **SC-002a**: For every delivery location tested — inside a serviced area, outside every serviced area, and on a boundary — the answer given up front is identical to the answer the same location receives at checkout, with zero disagreements.
- **SC-003**: In moderated testing, at least 90% of shoppers narrow a result set of more than one hundred products down to fewer than twenty using refinement alone, unaided, on their first attempt.
- **SC-003a**: For every supported ordering, paging to the end of a result set returns each matching product exactly once, in the stated order, and the displayed total matches the number of products actually returned.
- **SC-004**: 100% of shoppers who add an item report noticing that it was added, and duplicate accidental adds observed in testing fall to zero.
- **SC-005**: Every screen on both surfaces passes visual inspection at the narrowest supported phone width, a large phone, a portrait tablet, a landscape tablet, and a wide desktop viewport, in light and dark appearance, with zero clipped, overlapped, or unreachable content and zero essential content behind system bars, cutouts, or the keyboard.
- **SC-006**: Zero lettered navigation glyphs, improvised text-link back controls, spinner-only first-load states, and imageless cart lines remain reachable in the customer mobile app.
- **SC-007**: 100% of visible colours, type sizes, spacing steps, and radii on screens changed by this feature resolve to the shared design vocabulary, verified by inspection with no exceptions granted.
- **SC-008**: The same content rendered on both surfaces is judged to belong to one product in a side-by-side review, including the typeface, on a device-and-desktop pairing.
- **SC-009**: Screen-reader traversal completes discovery, product evaluation, cart, and checkout on both surfaces with zero unlabelled controls, zero focus traps, and zero unannounced dynamic changes; the web storefront additionally completes every one of those journeys by keyboard alone with focus always visible.
- **SC-010**: Every status, badge, refinement, and availability meaning remains correctly interpretable in a grayscale review, and every screen remains usable at the platform's maximum supported text size.
- **SC-011**: The web storefront's guest page-weight budget, server-rendered-shell behaviour, and search-engine visibility are each measured after the change and are no worse than before it.
- **SC-012**: All existing automated checks across both surfaces and the shared packages pass unchanged, and the shop surfaces show no behaviour change from any foundation extracted during this feature.
- **SC-013**: A product review of the delivered experience rates visual hierarchy, discovery clarity, delivery confidence, and perceived modernity at least 4 out of 5 on both surfaces.
- **SC-014**: The customer parity register lists every capability introduced here as present on both surfaces, with no entry marked outstanding at sign-off.
