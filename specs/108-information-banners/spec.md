# Feature Specification: Information Banners

**Feature Branch**: `108-information-banners`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Information banners: a fifth kind of promotion that carries no offer. Staff in back-office create a banner with a headline, an optional supporting line, an optional short label, one or more pictures, a skin, and where a tap leads (search, the sale page, a category, a product). It has a schedule (start/end, optional days and hours) like other promotions, can be published, paused, ended and archived, and is placed in display groups (home hero, home side, between sections, offers, cart) exactly like an offer. It never gives a discount, never has a code, has no audience/usage limits/budget/minimum spend, is never applied at checkout and never appears on an order, receipt or in promotion usage. Customers see it in the website and the app with no terms sentence and no code. A banner that states a fact owned elsewhere (e.g. the free-delivery amount) must read it from the active setting, never a typed copy. Also: seed 4 generic Effy banners for dev (no offers) once built."

## Context

Today every banner a shopper sees is an **offer**: one of four kinds (cart, item, buy X get Y, delivery), each with a
discount, conditions and, optionally, a code. Effy has no way to say something to shoppers that is not a discount, for
example "Groceries to home appliances, from one place" or "Delivered by Effy in a two-hour window". Faking one as an
offer would make checkout evaluate it, print a conditions sentence under it, and, for a fact like the free-delivery
amount, copy a number that lives in the delivery settings into a second place that goes stale when the setting
changes.

This feature adds **information banners**: promotions of a fifth kind that only inform. They are written, scheduled,
skinned, pictured and placed exactly like offers, and they never touch money.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff publish a banner that is not an offer (Priority: P1)

A marketing staff member opens Promotions in back-office, chooses **New information banner**, writes a headline
("Groceries to home appliances, from one place") and a supporting line, adds a picture, picks where a tap leads (the
Home & Kitchen aisle), places it in Home hero at position 1, and publishes it. Shoppers on the website and the app see
it in the Home carousel, styled by its skin, with no code and no conditions. A tap opens the aisle.

**Why this priority**: This is the whole gap: Effy cannot say anything to shoppers that is not a discount.

**Independent Test**: Create and publish one information banner in Home hero; open the website and the app home;
the banner shows with its words and picture, no code, no conditions sentence; a tap opens the chosen aisle; a cart
and checkout show no trace of it.

**Acceptance Scenarios**:

1. **Given** no promotions, **When** staff create an information banner with a headline and a target and publish it
   into Home hero, **Then** the website and app Home carousels show it within one minute, with its headline,
   supporting line, label and picture, and no code or conditions sentence.
2. **Given** a published information banner, **When** a shopper taps it, **Then** they land where its target says:
   search, the sale page, the chosen aisle, or the chosen product.
3. **Given** a published information banner and a cart that qualifies for nothing, **When** the shopper checks out,
   **Then** the cart, checkout, order, receipt (on screen and emailed) and the order's history name no promotion and
   show no discount.
4. **Given** the new-banner form, **When** staff look for discount, code, audience, usage limit, budget, minimum spend,
   delivery-type or combining settings, **Then** none are offered.
5. **Given** an information banner, **When** staff open its page, **Then** it says what kind it is, its state, its
   groups, its pictures and its history of changes, and shows no uses, discount given or sales figures.

---

### User Story 2 - A banner states a live fact, not a typed copy (Priority: P2)

Staff want a banner "Free delivery on orders over $150". Instead of typing "$150", they insert the **free-delivery
amount** as a live value. Shoppers see the amount from the delivery pricing plan active at that moment. When staff
activate the Christmas plan (free from $200), the same banner says $200 the next time a shopper sees it, with nobody
editing the banner.

**Why this priority**: Without it, the most useful generic banners (free delivery, the order minimum) would drift from
the truth the first time a setting changes, which is exactly the kind of two-sources-for-one-fact defect the platform
avoids.

**Independent Test**: Publish a banner whose words contain the free-delivery amount; read it on the website; activate
a plan with a different free-delivery amount; read it again; it shows the new amount.

**Acceptance Scenarios**:

1. **Given** the active Effy plan is free from $150, **When** a shopper sees a banner whose headline holds the
   free-delivery amount, **Then** it reads "$150".
2. **Given** that banner, **When** staff activate a plan that is free from $200, **Then** shoppers see "$200" the next
   time that place is shown, and the banner itself is unchanged.
3. **Given** the active plan has no free-delivery amount, **When** a shopper would see that banner, **Then** the banner
   is not shown, and back-office's group preview lists it as hidden with the reason ("the active delivery plan has no
   free-delivery amount").
4. **Given** the banner form, **When** staff insert a live value, **Then** they choose it from a fixed list, see what
   it reads right now, and the preview shows the banner as shoppers will see it.
5. **Given** staff type a number such as "$150" into a banner's words by hand, **When** they save, **Then** it is
   accepted as written (the platform cannot know a typed number is a copy), and the form points out that the
   free-delivery amount is available as a live value if the words mention free delivery.

---

### User Story 3 - Banners and offers share one place in every group (Priority: P2)

A group holds offers and information banners side by side, ordered by staff. Each member may use its own skin from
those that fit the group's size. Scheduling, pausing, ending and archiving work the same as for offers. A banner is
shown only while it is active (inside its dates, days and hours, not paused, not ended).

**Why this priority**: Banners are useful only if they sit in the places shoppers already look, under the same
controls staff already know.

**Independent Test**: Put one offer and one information banner in Home side cards; reorder them; pause the banner;
the website shows only the offer; resume it; both show in the chosen order.

**Acceptance Scenarios**:

1. **Given** a group with an offer at position 1 and a banner at position 2, **When** staff swap them, **Then** clients
   show the banner first.
2. **Given** a banner scheduled for next Monday, **When** a shopper opens Home before then, **Then** it is not shown,
   and the group preview lists it as hidden, "Scheduled".
3. **Given** a banner limited to weekdays 07:00–10:00 (Effy's clock), **When** a shopper opens Home at 11:00,
   **Then** it is not shown.
4. **Given** a published banner, **When** staff pause, resume, end or archive it, **Then** the same confirmations and
   history apply as for an offer, and the states it can be in are Draft, Scheduled, Active, Paused, Ended and Archived
   (never Used up or Out of budget).
5. **Given** a group whose default skin is a code layout, **When** a banner (which has no code) is placed in it,
   **Then** the banner uses the group's ordinary default skin, never the code one.
6. **Given** the promotions list, **When** staff filter by kind, **Then** "Information banner" is one of the kinds.

---

### User Story 4 - Generic Effy banners in dev (Priority: P3)

A developer resetting dev data runs one seed and gets four generic Effy banners in the Home groups, none of them an
offer: the range ("Groceries to home appliances, from one place"), the delivery promise ("Delivered by Effy, when it
suits you"), free delivery (with the live free-delivery amount), and local shops ("Fresh from Melbourne shops,
every day").

**Why this priority**: Useful for walking and demonstrating the storefront, but the feature stands without it.

**Independent Test**: On a dev database with the delivery seed applied, run the banner seed; the website Home shows the
four banners in their groups; none appears in the cart or checkout; running the seed again leaves exactly four.

**Acceptance Scenarios**:

1. **Given** a dev database with the delivery setup seeded, **When** the banner seed runs, **Then** four published
   information banners exist, placed in Home hero and Home side cards, each with a target and a skin.
2. **Given** the seed ran, **When** it runs again, **Then** there are still exactly four seeded banners.
3. **Given** a non-dev environment, **When** someone runs the banner seed, **Then** it refuses.

---

### Edge Cases

- **A banner's target goes away** (an aisle is removed, a product goes off sale): the banner behaves as an offer's
  tile does today. It is shown non-tappable rather than leading to a missing page, and the group preview warns staff.
- **Changing kind**: a banner cannot become an offer and an offer cannot become a banner. Staff create a new one.
- **A shopper's code entry**: an information banner has no code, so nothing a shopper types can match it.
- **The promotion engine**: it never considers an information banner, so a banner can never change a price, even
  if it is misconfigured.
- **A live value in a supporting line or label** works the same as in a headline; a banner with a live value that
  cannot be filled is hidden as a whole, never shown with a blank.
- **Cart group**: a banner placed in the cart group shows there like an offer's tile, but never as an applied or
  nearly-qualifying offer.
- **Deleting**: an information banner has no uses, so it may always be deleted while it is a draft, and archived
  afterwards, matching what an unused offer allows.

## Requirements *(mandatory)*

### Functional Requirements

**The kind**

- **FR-001**: Staff MUST be able to create a promotion of the kind **Information banner**, which carries no discount,
  no code, no audience, no usage or per-customer limits, no budget, no minimum spend or quantity, no delivery-type
  limit, and no combining rule.
- **FR-002**: An information banner MUST carry the same shopper-facing words as an offer (a headline, required to be in
  a group, an optional supporting line and an optional short label), an internal name, pictures, and a **target**
  (where a tap leads: search, the sale page, an aisle, or a product). The target is required.
- **FR-003**: An information banner MUST have the same schedule controls as an offer: optional start and end, optional
  days of the week and hours, on Effy's clock.
- **FR-004**: An information banner MUST be in one of Draft, Scheduled, Active, Paused, Ended or Archived, worked out
  the same way as for an offer. It MUST never be Used up or Out of budget.
- **FR-005**: Staff MUST be able to save a banner as a draft, publish it, pause, resume, end and archive it, with the
  same confirmations as for offers. A draft banner MAY be deleted.
- **FR-006**: The kind of a promotion MUST NOT change after it is created, in either direction.

**Never money**

- **FR-007**: The platform MUST never evaluate an information banner when pricing a cart, checkout or payment, MUST
  never record it on an order, an order line, a receipt or a refund, and MUST never count it in promotion uses,
  customers, discount given or sales.
- **FR-008**: The platform MUST refuse to store an information banner with any discount, code, limit, budget, minimum,
  audience or delivery-type setting, whichever route writes it.

**Live values**

- **FR-009**: Staff MUST be able to insert, into a banner's headline, supporting line or label, a **live value** chosen
  from a fixed list. At launch the list is: the **free-delivery amount** (from the active Effy delivery pricing plan)
  and the **order minimum** (from the order rules).
- **FR-010**: A live value MUST be filled from the setting as it stands when the banner is shown, so that changing the
  setting changes every banner that names it, with no edit to the banner.
- **FR-011**: When a live value has nothing to show (no active plan, a plan with no free-delivery amount, no order
  minimum), the banner MUST NOT be shown to shoppers, and back-office's group preview MUST list it as hidden with the
  reason.
- **FR-012**: The banner form MUST show what each live value reads right now, and the preview MUST show the banner
  filled in.
- **FR-013**: Live values MUST be available only to information banners. An offer's words keep their meaning as typed.

**Placement and display**

- **FR-014**: Staff MUST be able to place an information banner in any display group, at any position, alongside
  offers, and choose its skin per placement exactly as for an offer.
- **FR-015**: In a group whose default skin differs for promotions with a code, an information banner MUST use the
  ordinary default.
- **FR-016**: The customer website and the customer app MUST show an information banner in every place that shows a
  group (Home hero, Home side cards, Between Home sections, the Offers page, the cart, and the aisles menu), with its
  words, picture and skin, and with no code, no conditions sentence and no "ends in" countdown.
- **FR-017**: A tap on an information banner MUST lead to its target. A target that no longer exists MUST make the
  tile non-tappable, as for an offer.
- **FR-018**: The cart MUST NOT present an information banner as an applied offer, a nearly-qualifying offer or a
  saving.
- **FR-019**: The group preview in back-office MUST show information banners as shoppers see them, including which are
  hidden now and why (draft, scheduled, paused, ended, outside their hours, or a live value with nothing to show).

**Back-office**

- **FR-020**: The promotions list MUST let staff filter by the new kind, and every list, page and log that names a
  promotion's kind MUST name this one "Information banner".
- **FR-021**: An information banner's page MUST NOT show performance figures (uses, customers, discount given, orders,
  sales). It MUST show its state, words, target, pictures, groups and its history of changes.
- **FR-022**: Every change to an information banner MUST be recorded with who made it and when, as for offers.
- **FR-023**: Who may read and who may create, change or publish information banners MUST be the same as for offers.
- **FR-024**: The guided tour of the promotions screens MUST cover creating an information banner.

**Dev seed**

- **FR-025**: A dev-only seed MUST create four published information banners with no offers: the range, the delivery
  promise, free delivery (with the live free-delivery amount), and local shops. They go in Home hero and Home side
  cards, each with a target and a skin. Running it again MUST leave exactly four seeded banners, and it MUST refuse to
  run outside dev.

### Key Entities

- **Information banner**: a promotion of the fifth kind. It has an internal name, a headline, an optional supporting
  line and label, a target, pictures, a schedule, a state, placements in display groups (each with a position and an
  optional skin), and a history of changes. It has no discount, code, conditions or figures.
- **Live value**: a named fact from a fixed list (free-delivery amount, order minimum), written into a banner's words
  as a placeholder and filled from its owning setting each time the banner is shown. It has a name staff see, what it
  reads now, and whether it can be filled.
- **Display group**, **skin** and **picture**: unchanged. A group's members may now be offers or information banners.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can create, place and publish an information banner in under 3 minutes without being asked for
  any discount, code or limit.
- **SC-002**: 0 information banners ever change a price: across every checkout in the test suite with banners
  present, cart, checkout, order and receipt totals are identical to the same checkout with no banners.
- **SC-003**: After a delivery plan with a different free-delivery amount is activated, 100% of banners that name
  the free-delivery amount show the new amount the next time a shopper opens their place, with no banner edited.
- **SC-004**: A banner whose live value has nothing to show is shown to 0 shoppers, and the group preview names the
  reason.
- **SC-005**: A published, paused or ended banner appears or disappears on the website and the app within one minute,
  the same as an offer.
- **SC-006**: In dev, one command produces the four generic banners, and the website Home shows them on the next load.

## Assumptions

- "Pictures", "skin", "target" and "display group" mean exactly what they mean for offers today (094, 095). This feature
  adds no new layouts, sizes, targets or groups.
- The target list stays the one offers use, minus "the promotion's own page", which has nothing to show for a banner.
  "Nothing" (a non-tappable banner) is not offered at launch. Every banner leads somewhere.
- Shopper analytics already record a promotion tile being seen and tapped. Banners are recorded the same way, with
  their kind, and no new events are added.
- The fixed list of live values starts with two (free-delivery amount, order minimum). Adding one later is a small
  change, not a redesign.
- Courier delivery is off in dev, so "free delivery" means the Effy plan's free-delivery amount. A courier table's
  amount is not a live value at launch.
- The dev seed's banners carry no pictures of their own: skins give them a designed look. Pictures are uploaded through
  back-office, and seeding them would need writes to live storage.
- Old customer app builds: none are in people's hands yet (no compatibility fields, cleanup 2026-10-23), so the app and
  website are updated together and no compatibility plan is needed.
