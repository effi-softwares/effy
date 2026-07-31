# Feature Specification: Promotional Banner Templates & Home Carousel

**Feature Branch**: `029-promotional-banner-carousel`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "Complete the promotional banners and carousel for the customer storefront.
1) Back-office: admins creating a promotion can produce an image banner. There is a FIXED-SIZE TEMPLATE
for generating the banner, so every banner shares one canonical size and aspect ratio.
2) Mobile keeps that SAME aspect ratio and sizing — the banner must be fully responsive across device
widths, filling the available space where it cannot match exactly, but NEVER stretching or distorting
the artwork.
3) Promotion banners appear on the customer mobile Home page in two placements: interleaved BETWEEN
merchandising sections, and as a dedicated CAROUSEL section."

---

## Context: what 028 left unfinished

Feature 028 built the *plumbing* for promotional banners and never proved it: an advertising facet on
promotions, a presigned upload for artwork, a banner component, and a pager for several banners at one
position. **No promotion was ever marked advertisable, so no banner has ever rendered.**

Three gaps make that plumbing insufficient even once it is switched on:

1. **There is no canonical banner size.** 028's panel is sized by its *text*, with artwork behind it.
   An operator uploading a 3000×400 hero and an operator uploading a 600×600 square both get a panel
   as tall as its copy, with their artwork cropped to whatever is left. Neither can predict what a
   shopper will see, so neither can design for it.
2. **There is no way to produce a banner.** An operator is asked for artwork and given no dimensions,
   no text zone, and no starting point.
3. **There is one placement.** Banners interleave between sections; there is no dedicated carousel
   section, which is the placement a shopper recognises as "the store's current offers".

This feature closes all three, and **finishes 028's unwalked operator loop** — the first time a
promotional banner is seen by anyone.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An operator produces a banner that fits (Priority: P1)

An operator has a promotion and needs a banner for it. They are shown the exact canvas the storefront
will display — one fixed size, one aspect ratio, with the text zone marked — and can produce artwork
that fits it without guessing, without a designer, and without discovering the crop after publishing.

**Why this priority**: Nothing else in this feature matters if operators cannot make a banner. Today
they are asked for an image with no dimensions given, which is why none exists.

**Independent Test**: Fully testable in the back-office alone — download the template, upload artwork
made to it, confirm the stored result matches the canonical size, and confirm the preview is what the
storefront renders.

**Acceptance Scenarios**:

1. **Given** an operator is editing a promotion, **When** they open the banner tool, **Then** they see
   the canonical size stated in plain numbers, the canvas at the correct aspect ratio, and the safe
   area marked.
2. **Given** an operator has no design starting point, **When** they use the tool, **Then** they can
   download a template file at the canonical size with the text zone marked.
3. **Given** an operator uploads artwork made to the template, **When** they save, **Then** the stored
   artwork matches the canonical size exactly.
4. **Given** an operator uploads artwork of the wrong shape, **When** they save, **Then** they are told
   what shape is required and offered a way to make it fit — never a silent crop.
5. **Given** an operator has uploaded artwork, **When** they look at the preview, **Then** it shows the
   banner as a shopper will actually see it — including the live message over it and how it behaves at
   a narrow width.
6. **Given** the text zone will carry the message, **When** the operator is designing, **Then** the
   tool says so, so they leave that region quiet rather than putting their own headline in it.

---

### User Story 2 - The banner keeps its shape on every device (Priority: P1)

A shopper on any phone sees the banner as it was designed: the same proportions, the whole composition,
nothing squashed and nothing important cropped away — whether their screen is narrow, wide, or a tablet.

**Why this priority**: The point of a fixed template is that the operator can trust it. A banner that
distorts or crops unpredictably on a real device makes the template worthless, so this ships with US1
rather than after it.

**Independent Test**: Fully testable by rendering one known banner across the narrowest and widest
supported windows and comparing proportions against the canonical ratio.

**Acceptance Scenarios**:

1. **Given** a banner is displayed, **When** the device width changes, **Then** the banner's aspect
   ratio is unchanged and the artwork is never stretched or squashed.
2. **Given** a device narrower than the canonical width, **When** the banner renders, **Then** it
   scales down proportionally and remains fully legible.
3. **Given** a device wider than the canonical width, **When** the banner renders, **Then** it fills
   the available width without distortion, with no cropping — the ratio is shared, so the scale is uniform.
4. **Given** artwork that is still loading, **When** the banner renders, **Then** the space it will
   occupy is already reserved at the correct proportions, so nothing moves when the image arrives.

---

### User Story 3 - Offers have a place of their own (Priority: P2)

A shopper browsing Home reaches a section devoted to the store's current offers — several banners they
can swipe through in one place — rather than meeting promotions only one at a time between other
sections.

**Why this priority**: It is the placement shoppers recognise, and the one the request names. It builds
on US1 and US2, and Home works without it.

**Independent Test**: Fully testable by loading Home with several live promotions and confirming a
dedicated, titled offers section renders and swipes independently of the between-section placements.

**Acceptance Scenarios**:

1. **Given** several promotions are live, **When** the shopper scrolls Home, **Then** they reach a
   dedicated offers section containing those banners, swipeable, with a position indicator.
2. **Given** the shopper is on the offers section, **When** they do nothing, **Then** it does not
   advance on its own.
3. **Given** only one promotion is live, **When** Home renders, **Then** the offers section shows that
   one banner without a position indicator and without looking like a broken carousel.
4. **Given** no promotion is live, **When** Home renders, **Then** the offers section is absent
   entirely — no heading, no empty frame.
5. **Given** the shopper taps a banner in the offers section, **When** navigation completes, **Then**
   they reach what it advertises.

---

### User Story 4 - An operator decides where a promotion appears (Priority: P2)

An operator running several promotions decides which appear in the offers section, which sit between
merchandising sections, and in what order — so the storefront reflects a merchandising intent rather
than whatever happened to be created last.

**Why this priority**: Without it, every live promotion appears everywhere, and an operator running
four promotions floods Home. It depends on US3 existing.

**Independent Test**: Fully testable from the back-office — set a promotion's placement, confirm it
appears where chosen and nowhere else.

**Acceptance Scenarios**:

1. **Given** an operator sets a promotion's placement, **When** Home renders, **Then** the banner
   appears in that placement **and nowhere else** — never in both.
2. **Given** two promotions share a placement, **When** Home renders, **Then** they appear in the order
   the operator declared.
3. **Given** an operator changes a placement, **When** Home is next loaded, **Then** the change is
   reflected without an app release.
4. **Given** an operator marks a promotion advertisable without choosing a placement, **When** Home
   renders, **Then** the promotion appears in the default placement — never nowhere, and never an
   error.

---

### User Story 5 - The loop is proven end to end (Priority: P3)

An operator creates a promotion, produces its banner, marks it advertisable, and sees it on a real
device — then ends it and watches it disappear.

**Why this priority**: 028 shipped this path and never ran it. Until someone walks it, every claim
about banners is a claim about code that has never executed.

**Independent Test**: The walk itself is the test.

**Acceptance Scenarios**:

1. **Given** a newly advertised promotion, **When** Home is loaded on a device, **Then** its banner is
   visible with its artwork, message and code.
2. **Given** an advertised promotion that expires, is exhausted, is disabled, or is un-marked,
   **When** Home is next loaded, **Then** it is gone.
3. **Given** a promotion that is active but **not** marked advertisable, **When** Home is loaded,
   **Then** it appears nowhere.

---

### Edge Cases

- **Artwork of the wrong aspect ratio** — refused with guidance, or fitted by an explicit operator
  action. Never silently cropped.
- **Artwork much larger or smaller than canonical** — normalised to the canonical size; a small image
  must not be upscaled into a blurry banner without warning.
- **A promotion advertised with no artwork** — must still render as a legible text banner at the
  canonical proportions, since artwork is optional.
- **Very long message text over artwork** — must remain legible and must not overflow the canvas.
- **Largest system text size** — the banner's text must not overflow or clip.
- **Many live promotions at once** — the offers section must remain usable and must not become an
  unbounded swipe.
- **Slow or failed artwork load** — the space is reserved at the correct proportions; a failure shows
  a designed state, never a broken frame.
- **Dark appearance** — artwork produced against one background must remain legible in both
  appearances.
- **Tablet and landscape** — the banner must not stretch to fill an unbounded width.
- **Screen reader** — the banner's message must be available as text; the offers section must be a
  bounded, named group.

## Requirements *(mandatory)*

### Functional Requirements

#### The canonical banner

- **FR-001**: The platform MUST define exactly **one canonical banner size and aspect ratio**, used by
  the back-office tool, the stored artwork, and every surface that renders a banner.
- **FR-002**: The canonical definition MUST live in **one place** and be consumed by both the operator
  tool and the storefront, so the preview and the shopper's view cannot disagree.
- **FR-003** *(amended 2026-07-31, after planning)*: The canonical definition MUST include a **text
  zone** — the region the platform draws the promotion's live message over — so an operator knows which
  part of their artwork to leave visually quiet.
  - ⚠ **This replaced "the region guaranteed visible at every supported width".** Planning established
    that if the artwork and the render box are both locked to the same ratio, the scale is uniform and
    **nothing is ever trimmed** — so a trim-safe region would be the whole canvas and would tell an
    operator nothing. The area that genuinely constrains their design is the one the platform is going
    to print text on.
- **FR-004**: Stored banner artwork MUST conform to the canonical size. Artwork that does not MUST be
  normalised or refused, never stored as-is.

#### Producing a banner (US1)

- **FR-005**: An operator MUST be able to produce a banner for a promotion from within the back-office,
  without external tooling.
- **FR-006**: The tool MUST show the canonical canvas at the correct proportions with the **text zone**
  indicated.
- **FR-007**: The tool MUST show a **preview that matches what a shopper sees**, including at a narrow
  width.
- **FR-008**: Uploading artwork of the wrong shape MUST produce a **specific, actionable refusal** —
  stating the required shape — or an explicit fit/crop step the operator controls. It MUST NOT crop
  silently.
- **FR-009**: Artwork MUST remain **optional**: a promotion with no artwork must still produce a valid,
  legible banner.
- **FR-010**: The tool MUST be available to the same operators who may already edit promotions, and to
  no one else.
- **FR-011**: The back-office provides the **canvas and the checking**, not a picture editor. It MUST:
  (a) state the canonical size and aspect ratio in plain numbers, (b) show the text zone, (c) preview
  the result as a shopper will see it, and (d) validate what is uploaded. **The artwork itself is
  produced elsewhere** — any design tool, or none.
  - ⚠ **This narrows the original request** ("a fixed-size template for generating the banner"), and
    the narrowing is deliberate. It solves the problem operators actually have — nobody told them the
    dimensions — without building an image compositor. A composer is a larger feature and remains
    possible later; nothing here forecloses it.
- **FR-011a**: The platform MUST provide a **downloadable template file** at the canonical size with
  the **text zone** marked, so an operator can open it in whatever tool they already use and design
  straight onto the right canvas. A number in a help text is a thing to mistype; a file is not.

#### Rendering (US2)

- **FR-012**: A banner MUST render at the **canonical aspect ratio on every device and window width**.
- **FR-013** *(amended 2026-07-31, after planning)*: Artwork MUST **never be stretched or squashed**.
  Because conformant artwork and the render box share one aspect ratio, the scale is uniform and
  **no cropping occurs at all** — the requirement is met by construction rather than by crop rules.
  - ⚠ The original wording ("cropped from outside the safe area") assumed the two could differ. They
    cannot, once FR-004 holds. If a non-conformant image ever reaches a client — which FR-004 exists to
    prevent — it MUST be cropped centrally rather than stretched.
- **FR-014**: On a window narrower than canonical, the banner MUST scale down proportionally and remain
  legible.
- **FR-015**: On a window wider than canonical, the banner MUST NOT stretch; it MUST either fill within
  a sensible maximum or remain bounded, without distortion.
- **FR-016**: The space a banner will occupy MUST be **reserved at the correct proportions before its
  artwork arrives**, so no content moves when the image lands.
- **FR-017**: A banner's message MUST remain legible over any artwork, in **both light and dark
  appearance**, and at the **largest supported system text size**.
- **FR-018**: The banner's message MUST be available to assistive technology as text.
- **FR-019**: A banner whose destination is unknown MUST render **non-tappable** rather than dead-tapping.

#### The offers section (US3)

- **FR-020**: Home MUST present a **dedicated, titled section** containing promotional banners.
- **FR-021**: With more than one banner the section MUST be **swipeable** and MUST show a **position
  indicator**.
- **FR-022**: The section MUST **NOT auto-advance**.
- **FR-023**: With exactly one banner it MUST render that banner cleanly, without a position indicator.
- **FR-024**: With no banners the section MUST be **absent entirely** — no heading, no empty frame.
- **FR-025**: The section MUST be announced to assistive technology as a bounded, named group.
- **FR-026**: The number of banners in the section MUST be bounded, so the section cannot become an
  unbounded swipe.

#### Placement (US4)

- **FR-027**: Each advertised promotion MUST appear in **exactly one placement**, chosen by the
  operator: the **offers section** or **between merchandising sections**. A promotion MUST NOT appear
  in both.
  - ⚠ The alternative — every advertised promotion in both placements — needs no new data, and is
    wrong at the only scale that matters. With three or four promotions live a shopper meets the same
    offer repeatedly on one screen, and the store reads as if it is shouting.
- **FR-027a**: The placement MUST have a **safe default**, so an operator who marks a promotion
  advertisable without thinking about placement still gets a sensible result rather than an error or an
  invisible promotion.
- **FR-028**: An operator MUST be able to control the **order** of promotions within a placement.
- **FR-029**: A placement change MUST take effect **without an app release**, on the next load of Home.
- **FR-030**: Advertising MUST remain **opt-in**, defaulting to off, as established in 028 — a
  promotion becomes public only when an operator says so.

#### Text and artwork (cross-cutting)

- **FR-031**: The banner's message MUST remain **live text rendered over** the artwork. Artwork is a
  **background**; it MUST NOT carry the message.
  - ⚠ This **upholds 028's FR-033** rather than reversing it. Baked-in text cannot scale with a
    shopper's chosen text size, cannot be read by a screen reader, cannot be translated, and needs a
    re-render for every copy change. WYSIWYG typography is not worth those four.
- **FR-031a**: Because the message sits over the artwork, the platform MUST **guarantee its contrast**
  in both appearances regardless of what the operator uploads — an operator cannot be relied upon to
  test their artwork against every rendering condition, and a light photograph under light text is
  unreadable rather than merely ugly.
- **FR-031b**: The back-office MUST **tell the operator that the text zone will carry the message**, so they
  design a quiet background there rather than placing their own headline in it and discovering it
  double-printed.
- **FR-032**: Whatever the answer to FR-031, the shopper MUST be able to read a promotion's conditions
  (such as a minimum spend) before reaching payment, and the promotion's code MUST be available to act
  on.

#### Proving it (US5)

- **FR-033**: The full operator loop MUST be walked on a real device before this feature is considered
  done: create → produce banner → advertise → see it → end it → see it disappear.
- **FR-034**: The **not-advertised** case MUST be proven: an active promotion that has not been marked
  advertisable appears nowhere on the storefront.

### Key Entities

- **Banner template** — the canonical size, aspect ratio and text zone every banner conforms to. One
  definition, consumed by the operator tool and every rendering surface.
- **Banner artwork** — the stored image for a promotion, conforming to the template. Optional.
- **Placement** — where an advertised promotion appears on Home, and in what order.
- **Promotion** — unchanged from 027/028. This feature adds only how it is presented.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator with no design tools can produce and publish a banner in **under 5 minutes**,
  without asking anyone what size it should be.
- **SC-002**: **100%** of stored banner artwork conforms to the canonical size — verified by inspecting
  every stored banner.
- **SC-003**: A single banner rendered across the **narrowest and widest supported windows** differs in
  aspect ratio by **no more than 1%**, and shows no visible stretching.
- **SC-004** *(amended 2026-07-31 alongside FR-003/FR-013)*: **No artwork is cropped at any supported
  width** — satisfied by construction, since conformant artwork and the render box share one ratio.
  Verified by confirming the rendered ratio matches the canonical one (SC-003) rather than by
  inspecting crop boundaries, which do not exist.
- **SC-005**: Home's layout does not shift when banner artwork loads — measured as **zero movement** of
  the sections beneath it.
- **SC-006**: The offers section renders correctly at **0, 1, 2 and the maximum number** of live
  promotions, with no empty frame at 0 and no indicator at 1.
- **SC-007**: A promotion's placement and order change is visible on a device **within one reload**, with
  no app release.
- **SC-008**: A banner's message is readable in **light and dark appearance** and at the **largest
  supported system text size**, with no clipping or overflow.
- **SC-009**: A screen-reader user can read every banner's message and step **past** the offers section
  without becoming trapped.
- **SC-010**: The full loop is demonstrated on a **real device**: an advertised promotion appears, and
  an ended one disappears on the next load.
- **SC-011**: An active promotion that is **not** marked advertisable appears **nowhere** on the
  storefront — verified with advertised and unadvertised promotions live simultaneously.
- **SC-012**: **Five out of five** first-time testers shown Home can say what the current offer is
  without being prompted to look for it.

## Assumptions

- **Surfaces**: the shopper-facing half targets **customer mobile (Android + iOS)**, matching 028. The
  customer web storefront is out of scope and its existing banner behaviour is unchanged.
- **The canonical ratio** is a wide landscape shape suited to a phone-width promotional strip, chosen
  during planning against the reference platforms. A single ratio, not a set.
- **Existing promotion data is preserved**: 027's promotions and 028's advertising facet remain; this
  feature constrains and presents them rather than replacing them.
- **Artwork storage** reuses the existing media path established in 028 — this feature changes what is
  stored and how it is validated, not where.
- **Operator permissions** are unchanged: whoever may edit a promotion may produce its banner.
- **Advertising remains opt-in and defaults to off**, as 028 established.
- **The banner's destination vocabulary** is unchanged from 028.
- **The back-office does not composite images** (FR-011). It states the canvas, ships a template file,
  previews, and validates. Artwork is produced in whatever tool the operator already uses. A composer
  remains possible later and nothing here forecloses it.
- **A promotion appears in exactly one placement** (FR-027), so a store running several promotions does
  not repeat the same offer down one screen.
- **The message is live text over the artwork** (FR-031), upholding 028's FR-033. The consequence is a
  real constraint on artwork: the text zone must be designed as a quiet background, and the platform —
  not the operator — guarantees the contrast.

## Dependencies

- 027's promotions and 028's advertising facet, upload path and banner rendering.
- The back-office promotions console, where the banner tool lives.
- The customer mobile Home screen, which gains the offers section.
- The platform design language — the banner must work with no brand hue available.

## Out of Scope

- The customer **web** storefront's banner presentation.
- Multiple banner templates or per-campaign sizes — exactly one canonical shape.
- Scheduling beyond the promotion's existing window.
- Targeting, personalisation, or A/B testing of promotions.
- Analytics on banner performance beyond the platform's existing telemetry deferral.
- Rich media: video or animated banners.
