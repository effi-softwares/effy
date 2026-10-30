# Feature Specification: Promotion Skins - Designed by Staff, Chosen per Placement

**Feature Branch**: `095-promotion-skins`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "We need more customisation of each promotion type, banner or UI. Today no image can be
added to any promotion; we should allow it. With an image it should render in some design; without one the current
designs are good. We can have a list of skins defined for promotions, and back-office users select how a promotion
should look in each place (in the home page promotion A looks like skin 1, in the mega navigation promotion A looks
like skin 2). We need full customisation for skins." Clarified: staff build and save their own skins (a skin
builder), and may use any colour as long as the text stays readable.

## Why this feature exists

094 decided **where** a promotion is shown (display groups) but not **how it looks**: every promotion is drawn in one
of two fixed looks, in one colour, with a fixed icon, and no picture can be attached. Marketing cannot make a
seasonal campaign look seasonal, cannot use product photography, and cannot make the same offer look right both as a
large Home banner and as a small tile in the aisles menu. This feature lets staff design reusable **skins** in
back-office, attach pictures to promotions, and pick which skin a promotion wears in each place it appears - and the
website and the app draw exactly that.

## Clarifications

### Session 2026-10-21

- Q: What does "full customisation" of skins mean? → A: A skin builder. Staff create and edit named skins in
  back-office: choose a layout, then set every part of it (background, text, button, code chip, picture, decorations,
  shape), with a live preview; skins are saved and reused, and any promotion in any placement can wear any skin.
- Q: May staff use any colour? → A: Yes, any colour, but back-office checks readability and refuses to save a skin
  whose text cannot be read on what it sits on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach pictures to a promotion (Priority: P1)

A marketing manager opens a promotion in back-office and uploads one or more pictures (for example a wide lifestyle
photo and a square product shot), writes a short description of each for people who cannot see it, and marks the
part of each picture that must never be cropped away.

**Why this priority**: Without pictures the image-led skins have nothing to show; it is also the request the
operator raised first ("currently we can not add any images to any promotion").

**Independent Test**: Upload a picture to a promotion, place it in a group whose default skin shows a picture, and see
the picture on the website and in the app.

**Acceptance Scenarios**:

1. **Given** a promotion with no pictures, **When** a manager uploads a wide picture with a description, **Then** it is
   listed on the promotion with its description, size and shape, and can be chosen by any skin that shows a picture.
2. **Given** a picture, **When** the manager marks its focus point, **Then** every skin and screen size that crops the
   picture keeps that point in view.
3. **Given** a file that is not a picture, is larger than the limit, or is too small for its shape, **When** it is
   uploaded, **Then** it is refused with a sentence saying why, and nothing is stored.
4. **Given** a picture without a description, **When** the manager tries to save it, **Then** they are asked for one.
5. **Given** a picture in use by a placement, **When** the manager removes it, **Then** they are told where it is used,
   and on confirming, those placements fall back as in FR-016.

---

### User Story 2 - Build a skin (Priority: P1)

A manager opens **Skins** in back-office, creates a skin, picks a layout, and adjusts every part of it - background
colour or picture, the tint over a picture, the colours, sizes, weights and alignment of the small label, headline and
supporting line, the button's style, colours and words, the code chip, the decorations, the corners and the spacing -
while a live preview shows it with a real promotion, at phone and desktop widths, and in the app's light and dark
appearance.

**Why this priority**: This is the customisation the operator asked for; everything else depends on skins existing.

**Independent Test**: Create a skin from scratch, save it, and see it listed with a thumbnail; reopen it and every
setting is as saved.

**Acceptance Scenarios**:

1. **Given** the Skins list, **When** a manager creates a skin and picks a layout, **Then** the editor shows exactly
   the settings that layout has, each with its current value, and a preview that changes as each setting changes.
2. **Given** any colour setting, **When** the manager picks a colour (by picker or by typing its code), **Then** the
   readability of every piece of text against what it sits on is shown beside it as pass or fail.
3. **Given** a failing pair, **When** the manager saves, **Then** saving is refused and the failing parts are named
   (for example "Headline on background: too faint").
4. **Given** text placed over a picture, **When** the tint over the picture is too weak to guarantee readability,
   **Then** the editor says so and refuses to save until the tint is strong enough or the text is moved off the picture.
5. **Given** a saved skin, **When** a manager duplicates it, **Then** a copy with every setting is created under a new
   name, ready to edit.
6. **Given** the preview, **When** the manager switches between promotions (one with a code, one without; one with a
   picture, one without; a long headline and a short one), **Then** the preview redraws with each.

---

### User Story 3 - Choose a skin per placement (Priority: P1)

When placing a promotion in a display group (094), the manager chooses which skin it wears there and which of the
promotion's pictures that skin uses. The same promotion can wear one skin on the Home hero and another in the aisles
menu. Each group also has a default skin, used for any promotion placed there without one.

**Why this priority**: The operator's own example ("in home page promotion A should look like skin 1, in mega
navigation promotion A should look like skin 2").

**Independent Test**: Put promotion A in two groups with two different skins and see each look in its place on web
and app.

**Acceptance Scenarios**:

1. **Given** promotion A in `home-hero` and `mega-nav`, **When** the manager gives it skin 1 in the first and skin 2
   in the second, **Then** the website and the app draw A in skin 1 on the Home hero and skin 2 in the aisles menu.
2. **Given** a group with a default skin, **When** a promotion is placed there with no skin chosen, **Then** it wears
   the group's default.
3. **Given** a group, **When** the manager opens it, **Then** each member shows a small preview in the skin it wears
   there, and the whole group can be previewed as customers will see it.
4. **Given** a group whose place on screen is small (such as the aisles menu), **When** the manager picks a skin whose
   layout does not fit that place, **Then** the skin is not offered there, and the list says which layouts fit.
5. **Given** a skin that shows a picture, **When** the promotion has several pictures, **Then** the manager chooses
   which one this placement uses; if not chosen, the one whose shape best fits the layout is used.

---

### User Story 4 - Customers see the designed promotions (Priority: P1)

Shoppers on the website and in the app see each promotion in its chosen skin, in every place it is shown, with
pictures that load quickly and stay sharp on their screen.

**Why this priority**: The point of the work; without it nothing staff design is seen.

**Independent Test**: Change a placement's skin in back-office and, within a minute, see the new look on both clients.

**Acceptance Scenarios**:

1. **Given** a promotion in a skin, **When** a shopper opens the page or screen showing its group, **Then** it is
   drawn with that skin's layout, colours, text sizes, button, code chip, decorations and picture.
2. **Given** a skin with a "copy code" button and a promotion with a code, **When** the shopper taps it, **Then** the
   code is copied and they are told so; a promotion without a code shows the skin's other action instead.
3. **Given** the app in dark appearance, **When** it shows a promotion, **Then** the skin's colours are drawn exactly
   as designed (a skin does not change with the shopper's appearance) unless the skin defines its own dark colours.
4. **Given** a skin changed in back-office, **When** a shopper reopens the screen after up to one minute, **Then**
   they see the new look.
5. **Given** a slow connection, **When** a picture has not loaded yet, **Then** the skin's background colour is shown
   in its place and the text is readable immediately.
6. **Given** a screen reader, **When** it reaches a promotion, **Then** it reads the headline, the supporting line,
   the picture's description and the action, in that order; decorations are not read.

---

### User Story 5 - Skins from today's looks, and safe change (Priority: P2)

On the day this ships, nothing a shopper sees changes until staff choose to change it: today's two looks exist as
skins, every group's default is the look it uses today, and every placement wears its group's default. Staff can see
where a skin is used before changing or removing it.

**Why this priority**: The Home page must not change by surprise; and a skin edited in one place changes every
placement wearing it.

**Independent Test**: Deploy and compare Home, the offers page and the cart before and after: identical.

**Acceptance Scenarios**:

1. **Given** the release, **When** a shopper opens Home, **Then** every promotion looks as it did before.
2. **Given** a skin used by placements, **When** the manager opens it, **Then** the editor says how many placements
   in which groups wear it, and saving asks for confirmation that all of them will change.
3. **Given** a skin in use, **When** the manager tries to remove it, **Then** they must choose another skin for those
   placements first; a skin set as a group's default cannot be removed until the group's default is changed.
4. **Given** the two starting skins, **When** a manager edits them, **Then** they behave like any other skin (they
   can be edited and duplicated); they cannot be removed while any group uses them as its default.

---

### User Story 6 - The aisles menu shows promotions (Priority: P2)

The website's "All aisles" menu gains a promotion slot, filled from a new `mega-nav` display group, so marketing can
put an offer where shoppers browse.

**Why this priority**: Named by the operator as a place that needs a different look; a new place to sell.

**Independent Test**: Put a promotion in `mega-nav` and see it in the aisles menu in that group's skin.

**Acceptance Scenarios**:

1. **Given** a promotion in `mega-nav`, **When** a shopper opens the aisles menu, **Then** it appears in the menu's
   promotion slot in its skin, and tapping it opens the offer.
2. **Given** an empty `mega-nav` group, **When** the menu opens, **Then** the slot is not shown and the menu looks
   as it does today.
3. **Given** the app, which has no aisles menu, **When** `mega-nav` has members, **Then** the app shows nothing for
   it (the group is web-only until the app has a matching place).

---

### User Story 7 - Older app versions keep working (Priority: P2)

A shopper using an app version from before this feature still sees promotions, drawn in the look they have today.
An app version that does not know a newer layout draws the promotion in the group's fallback look.

**Why this priority**: There is no way to force an app update.

**Independent Test**: Run the 094 app build against the new backend and confirm promotions still show.

**Acceptance Scenarios**:

1. **Given** an app build from before this feature, **When** it reads Home, **Then** it receives the information it
   reads today and draws promotions as it does today.
2. **Given** an app build that knows some layouts, **When** a placement uses a layout added after that build,
   **Then** the build draws the promotion in its built-in default look with the promotion's headline and action.

---

### Edge Cases

- A headline longer than a layout comfortably holds: the layout shortens the text with an ellipsis at its line limit,
  and the editor preview warns when the longest headline in use would be cut.
- A placement's chosen picture is removed: the placement falls back as in FR-016.
- A skin's picture background has no picture in the promotion: the skin's fallback colour and decorations are used.
- Two staff edit the same skin at the same time: the second save is refused with "This skin changed while you were
  editing it" and the newer version is shown.
- A promotion ends or is paused: it disappears from every group as in 094; its skin choices are kept for when it
  comes back.
- A skin is used in a group whose space changed (for example the menu slot became smaller): placements whose layout
  no longer fits fall back to the group's default and the group shows a warning.
- A picture with a transparent background: drawn on the skin's background colour.
- A very large or very tall picture: refused if outside the allowed size and shape range; otherwise cropped around the
  focus point.
- Colour codes typed by hand that are not valid colours: refused beside the field.
- Text over a picture with a tint set to zero: refused (see US2 scenario 4).

## Requirements *(mandatory)*

### Functional Requirements

**Pictures**

- **FR-001**: Staff with promotion-editing rights MUST be able to add pictures to a promotion, up to 10 per promotion.
- **FR-002**: Each picture MUST have a description for people who cannot see it (1–150 characters) and a focus point;
  the focus point defaults to the centre.
- **FR-003**: The system MUST refuse files that are not pictures (accepted: photographs and graphics in the common
  web formats), files over 10 MB, and pictures smaller than the size the largest layout needs for the shape the picture
  is used in, each with a sentence saying why.
- **FR-004**: The system MUST make sized copies of every picture so phones, tablets and desktops each receive a copy
  close to the size drawn, and MUST serve them from the platform's one public picture address.
- **FR-005**: Removing a picture in use MUST say where it is used and require confirmation.

**Skins**

- **FR-006**: Staff with promotion-editing rights MUST be able to create, edit, duplicate, rename and remove skins;
  customer-service staff MUST be able to view skins and their previews but change nothing.
- **FR-007**: A skin MUST be built on one layout from a closed list maintained by Effy. The list at launch:
  - **Panel** - colour or picture background, text top-left, code chip and button bottom-left, decorations right
    (today's first look);
  - **Header card** - coloured or picture header with label and headline over a white body with a tag and a link
    (today's second look);
  - **Full picture** - the picture fills the skin, text over a tint, aligned to a chosen corner or centre;
  - **Picture beside text** - picture on one side (left or right), text and action on the other;
  - **Tile** - a small square or near-square tile: picture or colour, short headline, no supporting line;
  - **Strip** - a thin full-width band: one line of text, optional code chip and action, optional small picture.
- **FR-008**: Each layout MUST state which places it fits (large, medium, small, strip) and which settings it has.
  Across layouts, the settings a skin MAY carry are:
  - background: a colour, a picture from the promotion, or a picture with a tint (colour and strength);
  - the small label (for example "CODE", "OFFER"): shown or hidden, its own words or the promotion kind's word, colour,
    size, letter spacing;
  - headline and supporting line: colour, size (from a fixed scale), weight, alignment, line limit;
  - button: style (filled, outline, text link, none), fill and text colours, words (or the default for the promotion:
    "Copy code" with a code, "View offer" without), icon shown or hidden;
  - code chip: shown or hidden, style (dashed, solid, filled), colours;
  - decorations: shown or hidden, which illustration set (from a closed list), their colour and strength;
  - picture: which side or position, how it fills (cover or fit), corner shape;
  - shape: corner roundness (from the platform scale), inner spacing (compact, regular, roomy), outline shown or
    hidden and its colour;
  - optional dark-appearance colours for the app; when absent the skin looks the same in both appearances.
- **FR-009**: Any colour MUST be choosable by picker or typed code. Before saving, the system MUST check every piece of
  text against what it sits on (including text on the button and code chip) and refuse to save when normal text is
  below 4.5:1 or large text below 3:1; the editor MUST show each pair's result as the colour changes.
- **FR-010**: Text over a picture MUST sit on a tint whose strength guarantees the FR-009 contrast whatever the
  picture is (judged against both pure black and pure white beneath the tint); a skin that cannot meet this MUST NOT
  be saved.
- **FR-011**: The skin editor MUST show a live preview that updates as each setting changes, at phone and desktop
  widths, with a choice of real promotions to preview with, and (for skins with dark colours) in both appearances.
- **FR-012**: Every skin MUST show where it is used (groups, placements, and which groups use it as their default);
  saving a skin in use MUST ask for confirmation naming how many placements will change.
- **FR-013**: A skin MUST NOT be removable while any placement wears it or any group uses it as its default.
- **FR-014**: Two saves of the same skin from versions that differ MUST be refused for the later one, naming the
  conflict.

**Placements**

- **FR-015**: Each display group MUST have a size (large, medium, small, strip) and a default skin whose layout fits
  that size, optionally with a different default for promotions that carry a code (as the Offers page draws them today); each member of a group MAY choose its own skin from those that fit, and MAY choose which of the
  promotion's pictures it uses.
- **FR-016**: When a placement's skin needs a picture and the chosen picture is missing (none chosen, removed, or the
  promotion has none), the placement MUST use the best-fitting remaining picture of the promotion; if there is none,
  the skin's colour background with its decorations.
- **FR-017**: Back-office MUST show each group member in the skin it wears there, and MUST offer a preview of the
  whole group as customers will see it, on phone and desktop widths.
- **FR-018**: A new display group, `mega-nav` (size small), MUST be created; the website's aisles menu MUST show its
  first member in a promotion slot, and show no slot when the group is empty.

**Customers**

- **FR-019**: The website and the app MUST draw every layout from FR-007 with every setting from FR-008, from what the
  group read returns; two clients drawing the same placement MUST agree on layout, colours, text, picture and action.
- **FR-020**: A change to a skin, a picture or a placement MUST reach shoppers within one minute (the existing group
  read's freshness).
- **FR-021**: Until a picture has loaded, the skin's background colour MUST be shown and the text MUST be readable.
- **FR-022**: Each promotion MUST be announced to screen readers as headline, supporting line, picture description,
  action; decorations MUST be hidden from them.
- **FR-023**: Older clients MUST keep receiving what they read today; a client that does not know a layout MUST draw
  the promotion in its built-in default look.
- **FR-024**: Shops MUST NOT see skins, pictures or placements (as with every promotion detail, 094).

**Carry-over and record**

- **FR-025**: On release, a built-in **Classic** skin MUST draw each place exactly as it is drawn today (it cannot be
  edited or removed); every group MUST default to it and every placement MUST wear its group's default, so no shopper
  sees a change. Starter skins in today's two looks ("Panel - Effy blue", "Header card - Effy orange") MUST be
  available to pick and duplicate. The aisles menu's offers MUST come from `mega-nav`, seeded with the promotions it
  shows today.
- **FR-026**: Every change to a skin, a picture or a placement's skin MUST be recorded in the promotion's history
  (094) or the skin's own history, with who, when and what changed.
- **FR-027**: Taps on a promotion MUST be counted with the group and skin they were shown in, so marketing can compare
  how skins perform (no personal information beyond what 094 already records).

### Key Entities

- **Promotion picture**: a picture attached to one promotion - its sized copies, shape, description and focus point.
- **Skin**: a named, reusable design - one layout plus its settings (FR-008); has a version, a history and a list of
  where it is used.
- **Layout**: one of Effy's closed list of arrangements (FR-007); states the places it fits and the settings it takes.
- **Display group** (094, extended): gains a size and a default skin.
- **Group member / placement** (094, extended): gains an optional skin and an optional chosen picture.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A manager can attach a picture, build a new skin and apply it to a placement in under 10 minutes, with
  no help, on their first attempt.
- **SC-002**: On release day, 100% of promotions on Home, the offers page and the cart look identical to the day before.
- **SC-003**: For every saved skin, 100% of text pairs meet the readability thresholds in FR-009 (verified by checking
  every saved skin).
- **SC-004**: The same placement drawn on the website and in the app matches in layout, colours, text, picture and
  action for every layout (checked side by side for each of the six layouts).
- **SC-005**: A skin, picture or placement change is visible to shoppers within one minute.
- **SC-006**: Promotion pictures on Home load without the page jumping, and a shopper on a mobile connection sees the
  first promotion's picture within 2 seconds.
- **SC-007**: An app build from before this release shows promotions without error after the release.

## Assumptions

- Text uses the platform's own typeface; staff choose size (from a fixed scale), weight and alignment, not typeface.
  Free typefaces would break the storefront's identity and the app's bundled fonts.
- Layouts are added by Effy's developers, not by staff; staff customise everything inside a layout. A free-form canvas
  designer was considered and rejected (hard to keep readable and identical on phone, desktop and app).
- Decorations come from a closed set of illustration sets (food icons today; seasonal sets can be added by Effy).
- Pictures are uploaded per promotion, not to a shared library; a skin itself holds no pictures (its picture comes
  from the promotion it is drawn with), so one skin can serve many promotions.
- The words on a promotion (headline, supporting line) stay the promotion's own (094); a skin only sets how they look,
  plus its own small label and button words.
- Animation is not customisable; layouts may have the platform's standard motion.
- Editing rights follow 094: admins and managers edit; customer-service agents read.
- The customer app gets no aisles menu in this feature; `mega-nav` is website-only until it does.
- Picture storage, sized copies and the public picture address are the platform's existing ones (086).
- Depends on 094 (display groups, group reads, promotion history), complete in dev.
