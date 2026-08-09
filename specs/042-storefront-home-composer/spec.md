# Feature Specification: Storefront Home Composer

**Feature Branch**: `042-storefront-home-composer`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Storefront Home Composer — an operator-authored, block-based home page for customer-web, with a dedicated back-office editor, live preview, and a first-class 'offer tile' content type replacing the promo-code advertising facet."

---

## Why this feature exists

The storefront's home page is composed **in code**. Its top-to-bottom order is a hardcoded sequence, the hero's words and artwork are literals inside a component, and the only merchandising a member of back-office staff can change is an "advertising facet" bolted onto discount codes. Changing what the shop's front page says requires a developer and a deploy.

That coupling is not merely inconvenient — it has produced defects that are **live on the storefront today**, each recorded here because each is a requirement below rather than a bug to be fixed quietly:

| Observed today | Requirement that addresses it |
|---|---|
| The field distinguishing where a banner appears means **opposite things** on the web and mobile surfaces | FR-041 |
| The "order" an operator sets is stored, transmitted, and **ignored by the web surface** | FR-011, FR-042 |
| Artwork is checked on update but **not on create** | FR-033 |
| Promotional artwork is declared decorative, so a screen-reader user gets **nothing** | FR-026 |
| The promise that artwork is "never cropped" is **false on web**, which never adopted the shared canvas | FR-034, FR-035 |
| Every advertised promotion currently renders **twice** on the home page | FR-043 |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reorder and publish the home page (Priority: P1)

A member of back-office staff opens the Home Composer and sees the storefront's home page as an ordered list of blocks — the hero, the category shortcuts, each product rail, the offers section, and so on. They move the offers section above the first product rail, preview the result, and publish. Shoppers see the new order on the next page load. Realising it read better the other way, the operator reverts to the last published state in one action.

**Why this priority**: This is the whole point of the feature — the storefront's argument, top to bottom, becomes an operator decision rather than a deploy. It also delivers value with **no new block types at all**: simply making today's fixed sequence editable is a complete, shippable slice.

**Independent Test**: Reorder two blocks, publish, load the storefront, observe the new order; revert, reload, observe the original. No new content types required.

**Acceptance Scenarios**:

1. **Given** a published home layout, **When** the operator drags a block to a new position and publishes, **Then** the storefront renders blocks in the new order and the previously published layout remains recoverable.
2. **Given** an operator using only a keyboard, **When** they focus a block and activate its "move up" control, **Then** the block changes position and focus stays on the moved block.
3. **Given** an operator has made unpublished edits, **When** a shopper loads the storefront, **Then** the shopper sees the last **published** layout and none of the draft edits.
4. **Given** a published layout, **When** the operator reverts, **Then** the draft is discarded and the layout returns to the last published state.
5. **Given** a block is hidden rather than deleted, **When** the layout is published, **Then** the block does not render for shoppers but remains available to unhide later with its content intact.

---

### User Story 2 - Author an offers bento grid (Priority: P2)

The operator adds an Offers block and fills it with offer tiles — each with a headline, an optional eyebrow line above it, an optional supporting line, one call to action with its own label and destination, and background artwork. They choose each tile's size, producing a bento composition: one large tile, one wide, two small, one tall. On a phone the same tiles reflow to a single column.

**Why this priority**: This is the merchandising the operator most wants and cannot express today, because every piece of promotional content is currently forced to be a discount code. It depends on US1's block model but adds the first genuinely new content type.

**Independent Test**: Create three offer tiles of different sizes, publish, and confirm the grid composes correctly at desktop and phone widths, and that tapping a tile reaches its authored destination.

**Acceptance Scenarios**:

1. **Given** five offer tiles of mixed sizes, **When** the storefront renders at desktop width, **Then** the bento composition appears with each tile at its authored size.
2. **Given** the same five tiles, **When** rendered at phone width, **Then** they reflow to a single column with no tile's copy truncated or overlapping.
3. **Given** fewer tiles than a full composition, **When** the section renders, **Then** the layout degrades to a coherent arrangement rather than leaving empty frames.
4. **Given** an offers block with zero tiles, **When** the layout is published, **Then** the section does not render at all — no heading above blank space.
5. **Given** a tile with a call to action, **When** a shopper activates it, **Then** they arrive at the authored destination, and the control's accessible name identifies which offer it belongs to.
6. **Given** a tile references a promotion, **When** that promotion's live window ends, **Then** the tile stops appearing without any operator action.

---

### User Story 3 - See exactly what shoppers will see, before publishing (Priority: P2)

Before publishing, the operator previews the home page. The preview is the **real storefront page rendered by the real storefront components**, not an approximation — including the empty states, the dark appearance, and the phone width.

**Why this priority**: Equal in importance to US2 and separable from it. The home redesign that preceded this feature shipped **four visual defects that a fully green test suite could not see** — a backwards phone layout, a call-to-action hierarchy that vanished in dark mode, an orphaned divider, and a scrim that bleached the artwork. Layout, contrast and hierarchy are not properties a DOM assertion can check. A fidelity-accurate preview is the only control that catches them, and a preview that merely *approximates* the page is worse than none, because it teaches the operator to trust something wrong.

**Independent Test**: Make a draft edit, open the preview, confirm the change is visible there and absent from the public storefront, then confirm the preview and the published page are visually identical once published.

**Acceptance Scenarios**:

1. **Given** unpublished draft edits, **When** the operator opens the preview, **Then** the draft content renders while the public storefront still shows the published layout.
2. **Given** the preview is open, **When** the operator switches to the phone width, **Then** the page reflows exactly as it will for a shopper on that width.
3. **Given** a product rail whose source returns no products, **When** previewing, **Then** the operator sees the section's real empty behaviour rather than placeholder content.
4. **Given** a preview session, **When** it is ended, **Then** subsequent requests return published content only.

---

### User Story 4 - Be refused before shoppers see the mistake (Priority: P3)

The operator uploads artwork of the wrong shape, leaves a headline blank, writes a headline far past its length limit, or points a tile at a delisted category. Publishing is **refused**, and the message names which block and which problem.

**Why this priority**: The value is real but only realised at the moment of a mistake, so it can follow the primary flows. It is ranked above "nice to have" because every item on the refusal list is otherwise discovered by a shopper.

**Independent Test**: Attempt to publish a layout violating each rule in turn; confirm each is refused with a message identifying the block and the reason, and that the previously published layout is untouched.

**Acceptance Scenarios**:

1. **Given** a tile whose artwork is the wrong shape for its size, **When** publishing, **Then** it is refused and names the tile and the expected shape.
2. **Given** a tile with artwork but no alternative text, **When** publishing, **Then** it is refused.
3. **Given** a block referencing a category that no longer exists or is inactive, **When** publishing, **Then** it is refused and names the missing reference.
4. **Given** a copy field longer than its stated limit, **When** publishing, **Then** it is refused and names the field.
5. **Given** an arrangement producing an invalid heading sequence, **When** publishing, **Then** it is refused.
6. **Given** a refusal, **When** shoppers load the storefront, **Then** they see the last valid published layout, unchanged.
7. **Given** a publish attempt that bypasses the editor entirely, **When** it carries the same violation, **Then** it is refused identically — the check is not a property of the form.

---

### Edge Cases

- **A block type is removed from the catalogue while published layouts still reference it.** The page must render the remaining blocks and omit the unknown one, never fail to render.
- **A block's field set changes after layouts are saved.** Stored content in the old shape must still render or be omitted — never crash the page, and never silently render a partial block.
- **Two operators edit concurrently.** The second publish must not silently discard the first's work.
- **A referenced product/category/promotion is delisted *after* publishing.** Publishing-time validation cannot prevent this, so the storefront must omit the affected block rather than render a dead link or stale claim.
- **A rail's source returns zero items after publishing.** The section hides itself rather than rendering a heading above blank space.
- **Artwork fails to load at render time.** The tile renders its copy and call to action rather than a broken frame.
- **The layout is empty, or every block is hidden.** The storefront shows a coherent minimal page, never a blank one.
- **An operator adds many blocks.** There is an upper bound, refused with a clear message rather than degrading the page.
- **The first block carries no image.** Loading priority still resolves correctly for whichever image is genuinely first.
- **A tile's headline is far longer than the reference copy.** It must be bounded at author time or handled by the layout, never overflow its tile or push its call to action out of view.

---

## Requirements *(mandatory)*

### Authoring — the composer

- **FR-001**: A member of back-office staff MUST be able to view the storefront home page as an ordered list of blocks.
- **FR-002**: Staff MUST be able to add a block chosen from a **closed catalogue** of block types. Arbitrary or free-form blocks MUST NOT be creatable.
- **FR-003**: Every block type MUST be offered as one or more **presets** — pre-filled with representative content — rather than as an empty shell.
- **FR-004**: Staff MUST be able to reorder blocks by a keyboard-operable control (move up / move down) that is always visible. Moving a block by keyboard MUST keep focus on the moved block and announce its new position. Reordering MUST NOT be available by pointer only.

  > ⚠ **AMENDED 2026-08-09 (operator decision, T035a).** This requirement originally mandated dragging **and** a keyboard equivalent. Dragging is withdrawn: it added a drag-and-drop dependency to the back office and a second reordering mechanism to keep in step with the first, in exchange for convenience on a list the 20-block ceiling (FR-009) already keeps short. The accessibility half of the original requirement is not merely retained but strengthened — it was the fallback and is now the only path, so it cannot be the one that goes untested.
- **FR-005**: Staff MUST be able to remove a block, and separately to **hide** it — retaining its content for later reuse.
- **FR-006**: Staff MUST be able to edit a block's content through a form derived from that block type's own field definition.
- **FR-006a**: Staff MUST be able to see artwork that is already attached to a block, not merely a reference to it. ⚠ Recorded because it is absent today: the back office returns a storage key and renders a text placeholder where the operator's own image should be.
- **FR-007**: The system MUST NOT offer any control over colour, typography, spacing or alignment. Where a block legitimately has two appearances, it MUST be expressed as a named choice from a fixed set.
- **FR-008**: Blocks MUST NOT be nestable. The layout is a flat, ordered list.
- **FR-009**: The system MUST enforce an upper bound on the number of blocks in a layout, and refuse additions beyond it with a message stating the limit.
- **FR-010**: Every field offering a choice MUST present a fixed set of options. No field may accept a free-form value where an enumerated one is meaningful.
- **FR-011**: The order the operator sets MUST be the order shoppers see. No surface may impose its own sequence.

### Governance — draft, publish, revert

- **FR-012**: The system MUST maintain a **draft** layout distinct from the **published** layout. Editing MUST never alter what shoppers currently see.
- **FR-013**: Staff MUST be able to publish the draft, making it the layout shoppers see.
- **FR-014**: Staff MUST be able to **revert to the last published state** in a single action, discarding the draft.
- **FR-015**: The system MUST record who changed the layout and how — published, reverted, or draft saved — and when, in the platform's existing audit record, written as part of the same operation that changes the layout.
- **FR-015a**: Publishing MUST make the change visible to shoppers promptly and without a deployment. A published layout that only appears after a cache expires, or after a rebuild, does not satisfy FR-013.
- **FR-016**: Only staff whose platform record authorises them to manage merchandising MAY publish. The decision MUST be made from the platform's record of that person, not from a claim presented by the client.
- **FR-017**: Concurrent publishes MUST NOT silently discard another operator's work; the second MUST be refused or reconciled, never lost.

### Preview

- **FR-018**: Staff MUST be able to preview the draft layout as the **real storefront page rendered by the real storefront components**. A separate or approximate renderer MUST NOT be built.
- **FR-019**: The preview MUST show draft content while the public storefront simultaneously continues to serve the published layout.
- **FR-020**: The preview MUST be viewable at phone and desktop widths, reflowing exactly as the storefront does.
- **FR-021**: The preview MUST show each block's genuine empty and absent states, not placeholder content.
- **FR-022**: Access to draft content MUST be limited to authorised staff, and a preview session MUST be endable, after which only published content is served.

### The offers block and its tiles

- **FR-023**: An offers block MUST be composable from offer tiles, each carrying: a headline; an optional eyebrow line; an optional supporting line; one call to action with its own label and destination; background artwork; and a tile size.
- **FR-024**: Tile copy and the call to action MUST be **live content**, never baked into the artwork.
- **FR-025**: Tile size MUST be authored data, not inferred from position in a list.
- **FR-026**: Artwork MUST carry a text alternative. When artwork is genuinely decorative, that MUST be an explicit, recorded choice rather than the default.
- **FR-027**: A tile MUST NOT be a link containing another interactive control. Where a tile carries any control besides its call to action, the call to action MUST be a distinct control whose accessible name identifies its offer.
- **FR-028**: The bento composition MUST reflow to a single column on small screens with no tile's copy truncated or overlapping.
- **FR-029**: With fewer tiles than a full composition, the layout MUST degrade to a coherent arrangement. It MUST NOT render placeholder or empty tiles.
- **FR-030**: A tile MAY reference a promotion. When it does, it MUST additionally inherit that promotion's live window and stop appearing when the promotion ends, expires or is exhausted.

### Validation — refusals at author time

- **FR-031**: Publishing MUST be refused, naming the offending block and the reason, when any of the following holds: artwork is the wrong shape or exceeds its size limit; required copy is missing; a referenced product, category or promotion does not exist or is not active; a text alternative is absent; the assembled page's heading sequence would be invalid; or any copy field exceeds its stated length limit.
- **FR-032**: Every refusal in FR-031 MUST be enforced independently of the authoring interface. Validation present only in the editor form does not satisfy this requirement.
- **FR-033**: Artwork MUST be validated whenever it is attached — on creation as well as on change.
- **FR-034**: Copy MUST NOT be placed over artwork. It sits on a solid ground adjacent to the artwork, so its contrast is a property of the design system rather than of an operator's photograph.
  ⚠ **This is a scope decision, not an aesthetic one.** Validating text over a photograph requires decoding its pixels, and the platform deliberately has no image decoder. Placing copy beside the artwork removes the requirement instead of deferring it — and it is the arrangement ranked *most* common across the retailers surveyed, with a scrim ranked least. Should overlay be wanted later, it needs a decoder AND the rule that the legibility treatment derives from **the artwork itself**, never from the shopper's appearance preference — the same photograph is shown in both, so the thing guaranteeing legibility over it cannot be the thing that inverts.
- **FR-035**: Artwork MUST NOT be cropped in a way that removes authored subject matter. Every artwork shape the system accepts MUST correspond to the shape it is rendered in.
- **FR-036**: A refused publish MUST leave the previously published layout entirely unchanged.

### Rendering, performance and accessibility

- **FR-037**: Blocks MUST be rendered on the server. The public home page MUST remain prerenderable, with request-time content confined to bounded regions.
- **FR-038**: The block system MUST add no meaningful client-side code to the public storefront. The existing guest page-weight budget MUST continue to pass.
- **FR-039**: Image loading priority MUST be **derived from position** — the first image on the page loaded eagerly at high priority, all others deferred. It MUST NOT be an authored setting.
- **FR-040**: The page MUST retain exactly one top-level heading regardless of which blocks are present, with every block heading subordinate to it.
- **FR-041**: The layout MUST be expressed in one form consumed by every surface that renders it, so no two surfaces can interpret the same authored content differently.
- **FR-042**: A block whose content cannot be rendered — an unknown type, an outdated shape, or a reference that has since disappeared — MUST be omitted while the rest of the page renders.
- **FR-043**: Any given piece of merchandising MUST appear **at most once** on the page.

### Data lifecycle and removals

- **FR-044**: Discount codes MUST no longer carry presentation content. The advertising fields currently attached to them are removed, leaving them purely a discount mechanism.
- **FR-045**: The promotion-detail destination that exists solely because a discount code had nowhere to point MUST be removed, since an offer tile carries a real destination. Any address a shopper may hold MUST land on a page that explains the offer has ended and offers a route onward — never an error, and never a bare not-found.
- **FR-046**: Existing advertised promotions MUST have a documented disposition — migrated to offer tiles or deliberately not carried forward — recorded explicitly rather than left to chance.
- **FR-047**: Removing the advertising fields MUST NOT affect the discount, cart or checkout behaviour of promo codes.

### Explicitly out of scope

The following MUST NOT be built in this feature. Each carries its reason, so the exclusion is a decision rather than an omission:

- **Colour, typography, spacing or alignment controls.** The platform's design system is enforced by build-time checks over source; a value stored as content is invisible to them, so such a control silently defeats the guarantee.
- **A custom markup/style/script block.** It voids every guarantee simultaneously — design consistency, contrast, page weight, cross-surface parity and safety.
- **A rich-text editor.** It reintroduces presentation into stored content, which is what makes a single authored layout unusable by a non-web surface.
- **Nesting, rows, columns or a general layout system.** It converts merchandising into design work and removes every structural invariant a check could assert.
- **Approvals, review workflow, or per-field permissions.** There is one operator; a review step whose author and approver are the same person teaches people to ignore review steps.
- **Full version history with comparison.** "Revert to last published" captures the great majority of the value at a small fraction of the cost.
- **Scheduled publishing of a whole layout.**
- **Audience targeting or personalisation of blocks.** ⚠ A per-shopper block makes the home page shopper-specific, which destroys the prerendered page the storefront's speed depends on.
- **Split testing.** ⚠ It requires attribution the platform cannot currently produce; product analytics has never been initialised on this surface, so measurement would be fictional.
- **Localisation**, and **any page other than the storefront home.**

### Key Entities

- **Home layout** — the ordered list of blocks for the storefront home page, in a draft state and a published state. Records who last published it and when.
- **Block** — one entry in a layout: its type, its content, its position, and whether it is hidden. Content shape is defined by the type.
- **Block type** — a member of the closed catalogue, defining which fields its content has, which are required, which offer a fixed set of choices, and one or more presets.
- **Offer tile** — the content of an offers block entry: headline, optional eyebrow, optional supporting line, one call to action (label and destination), artwork with its text alternative, size, and an optional reference to a promotion.
- **Artwork shape** — a named, defined image shape with its dimensions and limits. One definition per shape; nothing else states these numbers.
- **Reference** — a pointer from block content to a catalogue entity by identity, never by name, so renaming or delisting cannot leave stale copy.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member of back-office staff changes the home page's content and order and makes it live **without any developer involvement and without a deployment**.
- **SC-002**: An operator unfamiliar with the tool completes "add an offer, position it, preview it, publish it" **on the first attempt, in under 10 minutes, without written instructions**.
- **SC-003**: The published page is **visually identical** to what the preview showed — assessed by a person comparing them at both a phone and a desktop width, in both light and dark appearance.
- **SC-004**: Reverting returns the storefront to its previous published state in **one action**, verified by a person.
- **SC-005**: The public home page's measured page weight **does not increase** against its existing budget, and the page remains prerendered.
- **SC-006**: The largest image on the first screen is loaded at high priority and is **not deferred**, verified on a production build. (Today the inverse is true.)
- **SC-007**: **Every** rule in FR-031 is proven by attempting a violating publish **through a path that bypasses the editor**, and observing the same refusal.
- **SC-008**: A screen-reader user can reach every offer tile's message and its call to action, and can tell which offer each control belongs to — verified by a person using a screen reader, not by an automated scan alone.
- **SC-009**: **No published tile places copy over artwork.** Every tile's copy sits on a design-system ground and meets the contrast minimum by construction — verified by asserting the rendered tile's text never overlaps its image box, at every breakpoint.
- **SC-010**: The page has exactly **one** top-level heading and a valid heading sequence for every combination of blocks tested.
- **SC-011**: The published layout has **one** interpretation, proven by a cross-language contract test rather than by comparing surfaces — only one surface consumes it in this feature. ⚠ Stated this way because the defect it guards is real: the field distinguishing placement today means opposite things on the two customer surfaces. Comparing surfaces becomes the test when mobile adopts the layout.
- **SC-012**: No piece of merchandising appears more than once on the page, in any tested combination.
- **SC-013**: With an empty layout, every block hidden, or every data source empty, the storefront renders a coherent page with **no empty frames, no headings above blank space, and no broken images**.
- **SC-014**: Removing the advertising fields leaves discount, cart and checkout behaviour unchanged, proven by the existing suites passing untouched.
- **SC-015**: An operator **cannot** produce a published page that is off-brand, fails the accessibility rules in FR-031, or exceeds the page-weight budget — attempted deliberately and refused.

---

## Assumptions

- **One operator, one storefront.** Features that exist to coordinate multiple editors are excluded on that basis; FR-017 still prevents silent data loss because two sessions are possible even with one person.
- **The block catalogue is derived from what the storefront already renders** — the hero, category shortcuts, product rails, offers, the value strip, the app promotion and the newsletter — rather than invented. This is what makes the scope affordable: it is largely a restatement of existing components as data.
- **Roughly seven block types** at launch. The exact set is confirmed during planning against what is actually on the page.
- **The existing artwork upload and storage path is reused**, extended from one artwork shape to several.
- **The existing staff record and role model is reused** for authorisation; no new roles are introduced.
- **The existing audit record is reused** for FR-015.
- **Blocks obtain their catalogue data at render time** by reference, so a layout does not embed copies of product or category data that could go stale.
- **The mobile surface is not required to consume the layout in this feature**, but the layout's form must not preclude it — FR-041 exists so that adopting it later is a rendering change, not a re-authoring one.
- **Existing advertised promotions are few** and can be carried forward by hand; FR-046 requires the decision be recorded either way.
- **"Contrast minimum" means the platform's existing accessibility standard**, applied to text over artwork — a case the current token-based checks structurally cannot cover, because a photograph is not a token.
