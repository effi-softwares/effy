# Feature Specification: Monochrome Design Language & Customer Mobile Rebuild

**Feature Branch**: `[026-monochrome-design-language]`

**Created**: 2026-07-29

**Status**: Draft

**Input**: User description: "I have found a good new UI design. I want to use it to completely refactor the customer mobile app. I really like this UI design and the colour theme, so update the app's colour theme and completely use this as our UI. Understand every screen in it and map it to ours; update our theme colours to match; where a screen is missing in the app, create it with dummy data; where a screen is missing from the design, use the same design structure and content to implement it. This UI is very elegant and supports both Android and iOS."

## Context

Effy has had one brand colour since the platform began, and it has never been the thing anyone chose — it was inherited. Jade came first, Effy Emerald replaced it, and both were selected to fill a slot in the design system rather than because anyone looked at the product and wanted it to feel that way. The operator has now chosen a visual identity deliberately: a monochrome commerce design language, built on a pure neutral scale where near-black carries every accent role, paired with a tight, low-tracking display typeface.

The identity is not a coat of paint on one surface. Effy's design vocabulary has exactly one source of truth, and every one of the six surfaces reads from it. That is the platform's greatest strength here and its largest cost: changing the accent changes all six at once, and the brand marks shipped for five of them — every app icon, splash screen, and favicon — were generated from the retiring palette and no longer belong to the product they open.

At the same time, the customer mobile app is the surface the operator actually wants to feel different. Its screens were assembled feature by feature as commerce capability landed — auth, then catalogue, then cart, then checkout, then orders — and a presentation pass gave them iconography, title bars, safe areas, skeletons, and motion. What that pass deliberately did not do was change the brand. So the app is now well-built and correctly behaved, and still does not look like the product the operator has in mind.

This feature does both halves: it replaces the platform's visual identity everywhere, and it rebuilds the customer mobile app's screens against the chosen design language — including a set of screens the app has never had at all, and two screens the design language has never had, which must be invented in its idiom.

The chosen reference is an apparel catalogue. Effy is a single-brand, hidden-fulfilment grocery store. Nothing may be copied that assumes clothing, sellers, sizes, or ratings; what transfers is the visual and structural language, not the merchandise.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Meet One Deliberate Visual Identity (Priority: P1)

Anyone who touches Effy — a shopper on the storefront, a shop operator on a console, a member of back-office staff — sees the same deliberately chosen visual identity: one neutral palette in which near-black carries every accent role, one typeface, one type hierarchy, one spacing rhythm, in both light and dark appearance.

**Why this priority**: The identity is the foundation every other story is expressed in. It is also the only story that delivers value on its own to every audience simultaneously, and it is shippable without a single screen being restructured — the surfaces simply stop looking inherited and start looking chosen.

**Independent Test**: Open all six surfaces before and after the change, in light and dark appearance, and confirm each one renders in the new palette and typeface with no retired brand colour reachable anywhere, no screen broken by the change, and no behaviour altered.

**Acceptance Scenarios**:

1. **Given** any of the six surfaces, **When** it is displayed, **Then** every accent role — primary action fill, selected state, active navigation, focus indication, emphasis — is carried by the neutral scale, and no brand hue appears anywhere.
2. **Given** any surface, **When** it is displayed, **Then** all text renders in the new platform typeface, with display sizes carrying the identity's tight negative letter-spacing.
3. **Given** the retired brand colours, **When** the whole repository is checked, **Then** no retired value remains in any authored source, token, generated theme, or committed asset, and an automated check proves it and names any surface that regresses.
4. **Given** the identity is defined only for light appearance by its source, **When** a shopper selects dark appearance on any surface, **Then** a dark counterpart of the same identity is presented — recognisably the same design language, not an inversion artefact — and every accent role remains legible.
5. **Given** a person changes the appearance preference while using any surface, **When** the change applies, **Then** the surface updates without losing their place, exactly as before.
6. **Given** the new palette, **When** every foreground and background pairing in use is measured, **Then** each one meets the platform's enforced contrast floor, and the check fails the build if any pairing does not.
7. **Given** the identity change, **When** every existing automated check across all surfaces and shared packages runs, **Then** all pass, and no commerce, session, authorisation, or routing behaviour differs.

---

### User Story 2 - Recognise Effy Before the App Opens (Priority: P2)

Someone who installs Effy sees a brand mark on their home screen, a splash screen on launch, and a favicon in their browser tab that belong to the same product the identity change just produced — not the previous one.

**Why this priority**: The brand marks are the first and most persistent expression of the identity, and after Story 1 they are actively wrong: an app icon in the retired colour opening an app in the new one is a visible contradiction. It is separated from Story 1 because it is a distinct body of asset work with its own generation and verification, and Story 1 is coherent without it for a short window.

**Independent Test**: Regenerate every committed brand asset, install both mobile apps on a device, open all three web surfaces in a browser, and confirm every icon, splash, and favicon presents the new identity with no retired colour and no visual regression at any size.

**Acceptance Scenarios**:

1. **Given** the committed brand assets, **When** they are regenerated from their authored source, **Then** every derived asset across every branded surface carries the new identity, and the drift check passes.
2. **Given** the drift check, **When** any derived asset is stale, orphaned, or missing, **Then** the check fails and names the specific surface at fault.
3. **Given** a mobile app is cold-launched, **When** the splash screen appears, **Then** its ground colour and mark belong to the new identity in both light and dark appearance.
4. **Given** the mark is displayed at its smallest committed size, **When** it is inspected, **Then** it remains legible and unclipped, including inside every platform launcher mask shape.
5. **Given** the surfaces that were previously distinguished by different mark colourways, **When** their marks are compared, **Then** they remain distinguishable from one another by a means that does not depend on a brand hue.
6. **Given** regeneration is run twice from an unchanged source, **When** the outputs are compared, **Then** they are identical.

---

### User Story 3 - Shop a Rebuilt Customer App (Priority: P3)

A shopper opens the customer mobile app and moves through the whole journey — discover, search, refine, evaluate a product, build a cart, check out, and review orders — on screens rebuilt in the chosen design language, on both Android and iOS.

**Why this priority**: This is the surface the operator wants changed and the one the public uses. It is third only because it is expressed in the identity Story 1 establishes; attempting it first would mean rebuilding every screen twice.

**Independent Test**: Complete the full guest-to-purchase journey on a phone and a tablet, on both platforms, and confirm every screen presents the new design language, every existing capability still works, and nothing about pricing, delivery, payment, or orders behaves differently.

**Acceptance Scenarios**:

1. **Given** any screen the app already had, **When** it is displayed, **Then** it presents the new design language — its app bar, navigation, typography, spacing, imagery treatment, controls, and primary action styling all drawn from the chosen identity.
2. **Given** the design language lays some content out in bordered containers, **When** that content is rendered in Effy, **Then** cart lines, order lines, account entries, and detail rows are presented as list rows and sections rather than containers, while keeping the identity's typography, imagery, and spacing rhythm; product tiles remain the single container exception.
3. **Given** the design language belongs to an apparel catalogue, **When** any screen is rendered in Effy, **Then** no clothing-specific concept appears — no size selection, no garment framing — and all content is grocery-appropriate.
4. **Given** the app's category browse experience, **When** it is displayed, **Then** it uses the same structural language and content patterns as the rest of the identity even though the source design has no such screen, and it is indistinguishable in style from the screens that were derived directly.
5. **Given** the app's delivery-location and serviceability affordance, **When** it is displayed, **Then** the same holds — it belongs to the identity despite having no counterpart in the source design.
6. **Given** a shopper on any screen, **When** they use it, **Then** the presentation foundation established by the previous refresh — meaningful navigation icons with labels, title bars with standard back affordances, safe-area correctness, loading placeholders, pull-to-refresh, transient confirmations, press feedback, and reduced-motion handling — is preserved, not regressed.
7. **Given** a shopper completes a purchase, **When** the order is placed, **Then** pricing, delivery quoting, payment, and order handling behave exactly as before the rebuild.
8. **Given** any screen, **When** it is displayed, **Then** no fulfilment location is named, numbered, or made inferable.
9. **Given** the payment step, **When** the shopper reaches it, **Then** the payment provider's own sheet is presented as before, and no attempt is made to substitute a look-alike payment or card-entry screen.
10. **Given** a guest, **When** they discover, evaluate, and build a cart, **Then** they are asked to sign in only where they already were, and no new sign-in gate is introduced.

---

### User Story 4 - Reach the Screens the App Never Had (Priority: P4)

A shopper is introduced to Effy on first launch, can see what the app has told them, can follow an order's progress, and can find answers and a way to reach a person — all of which the app currently has no screen for.

**Why this priority**: These screens add reach rather than fix a defect, and several stand on capabilities the platform has not built yet, so they are the most deferrable. They are still in scope because the chosen design language includes them and an app missing them looks unfinished next to it.

**Independent Test**: Launch the app for the first time, traverse each new screen from its natural entry point, and confirm each is complete, navigable, styled in the identity, and honest about what is real and what is placeholder.

**Acceptance Scenarios**:

1. **Given** a first launch, **When** the app opens, **Then** an introduction is presented that can be advanced through and can be skipped, and it is not shown again on subsequent launches.
2. **Given** a shopper opens the notifications screen, **When** notifications exist, **Then** they are listed with a clear time reference; **When** none exist, **Then** an empty state explains that plainly and offers a route onward.
3. **Given** the platform does not yet deliver notifications, **When** the screen is populated with placeholder content, **Then** the placeholder nature is evident to the operator reviewing it and no placeholder is presented to a shopper as a real event.
4. **Given** a shopper opens an order that is still in progress, **When** they view its tracking, **Then** they see that order's progress as a sequence of states with the current one clear.
5. **Given** order tracking is displayed, **When** it renders, **Then** it reveals no fulfilment location, no map of one, no courier identity, and nothing else a shopper could not already obtain.
6. **Given** a shopper opens the help area, **When** it is displayed, **Then** they can read answers to common questions, browse help topics, and reach a contact route for a person.
7. **Given** any screen introduced here, **When** it is displayed, **Then** it is indistinguishable in visual language from the screens rebuilt in Story 3.

---

### User Story 5 - Use a Colourless Product Without Barriers (Priority: P5)

A shopper or staff member using assistive technology, larger text, a keyboard alone, or simply a device in bright sunlight can use every surface — and can still tell what everything means, in an identity that has almost no colour left to mean anything with.

**Why this priority**: It is last because it is verified across the work the earlier stories produce, and first in importance among the things that could silently go wrong. Removing colour from a design system removes the lazy way of signalling meaning, which makes this story both riskier and more valuable than it was under the previous identity.

**Independent Test**: Traverse every screen changed by this feature on every surface with a screen reader, by keyboard on the web, at maximum supported text size, in grayscale, and in both appearances, and confirm no barrier and no lost meaning.

**Acceptance Scenarios**:

1. **Given** any status, badge, availability, selected state, error, or destructive action, **When** it is displayed, **Then** its meaning is carried by text, shape, icon, weight, or position — never by colour alone — and remains fully interpretable in grayscale.
2. **Given** a shopper using a screen reader, **When** they traverse discovery, product evaluation, cart, checkout, orders, and every screen introduced here, **Then** every control is labelled, reading order is logical, and dynamic changes are announced.
3. **Given** a person using a web surface by keyboard alone, **When** they traverse any screen changed by this feature, **Then** every interactive element is reachable, focus is always visible against the new palette, and no focus trap exists.
4. **Given** system text size is increased to the platform's supported maximum, **When** any screen is displayed, **Then** text remains readable and no control is clipped or unreachable.
5. **Given** the identity's tight display letter-spacing, **When** text is rendered at large sizes, in long strings, and in scripts with different line heights, **Then** it remains legible and does not collide or clip.
6. **Given** every screen on both mobile platforms and every web surface, **When** reviewed across the supported viewport set in both appearances, **Then** there is no clipped, overlapped, or unreachable content and no essential content behind system bars, cutouts, or the keyboard.

### Edge Cases

- A surface or component references the retired brand colour indirectly — through a generated theme, a committed asset, a test fixture, or documentation — and survives the sweep.
- A foreground/background pairing that passed contrast under a coloured accent fails under a neutral one, or vice versa.
- Dark appearance derivation produces a pairing that is technically compliant but visually flat, losing the distinction between surface levels that colour previously provided.
- The new typeface lacks a glyph, a weight, or a script the previous one had, or renders at a different optical size and breaks a layout that was tuned to the old metrics.
- The typeface's licence turns out to restrict the platform's intended use, or requires attribution the product does not currently carry.
- Two surfaces that were previously distinguished by mark colourway become indistinguishable once colour is removed.
- A brand mark that was legible at small sizes because of its colour contrast is no longer legible in neutral.
- A shopper is mid-session, mid-cart, or mid-checkout when the app updates to the new identity.
- A screen invented in the design language's idiom drifts from it, and no automated check can catch a stylistic drift.
- Placeholder content on a new screen escapes to a shopper, or is mistaken for real data by the operator during review.
- An order's progress states do not map cleanly onto the tracking presentation, or an order reaches a state the presentation does not anticipate.
- Order tracking implies a fulfilment location through timing, wording, or sequence even though it names none.
- A pairing the chosen design ships — such as a disabled control's label against its fill — fails the platform's contrast floor and must be adapted without losing the design's character.
- The chosen design's display letter-spacing and line-height values are expressed in units that render differently than intended, clipping or colliding text at the largest sizes.
- The chosen design offers a credential route the platform does not support, or omits one it does.
- The chosen design's primary navigation set differs from the app's, leaving a capability with no home.
- The identity change alters rendered page weight or first paint on the public storefront.
- Very long product names, category names, or addresses under a tighter typeface.
- Reduced-motion, high-contrast, or forced-colours modes interacting with a monochrome palette.

## Requirements *(mandatory)*

### Doctrine and Boundaries

- **FR-001**: This feature MUST change only how the platform is presented. Commerce behaviour, pricing, delivery quoting, payment, order handling, authorisation, routing, and stored data MUST remain unchanged.
- **FR-002**: No new server capability MUST be added. Where a desired presentation cannot be truthfully served by an existing capability, the presentation MUST be reduced rather than the boundary widened.
- **FR-003**: The guest-first rule MUST hold: sign-in MUST be requested only where it already is today.
- **FR-004**: Every colour, type size, weight, letter-spacing, spacing step, and corner radius MUST come from the shared design vocabulary. No improvised or hardcoded value is permitted on any surface.
- **FR-005**: Card-style containers MUST NOT be introduced as a general layout device. Product tiles remain the single recorded exception; cart lines, order lines, account entries, and detail rows MUST be rows or sections.
- **FR-006**: No fulfilment location MUST ever be named, numbered, or made inferable on any surface introduced or changed here.
- **FR-007**: The chosen design language MUST be adapted, never reproduced as merchandise. No apparel-specific concept — size selection, garment framing, seller signals — MUST appear in Effy.
- **FR-008**: The source design's licence and any attribution requirement MUST be confirmed before any derived asset ships, and the finding MUST be recorded.

### Visual Identity

- **FR-009**: The platform's brand accent MUST become a neutral near-black, and the neutral scale MUST carry every accent role — primary action fill, selected state, active navigation, focus indication, and emphasis.
- **FR-009a**: The identity MUST carry exactly two semantic colours alongside the neutral scale — one for success and one for error and destruction — as defined by the chosen design. No further hue MUST be introduced, and neither semantic colour MUST be used decoratively or as an accent.
- **FR-010**: The retiring brand accent and its destructive companion MUST be removed from the platform entirely, in the same manner the previous retired palette was removed.
- **FR-011**: An automated check MUST prove no retired brand value remains in any authored source, token, generated theme, or committed asset, MUST fail the build when one does, and MUST name the offending surface.
- **FR-012**: The platform typeface MUST be replaced across all six surfaces, and the identity's tight negative letter-spacing MUST be applied at display sizes.
- **FR-013**: All six surfaces MUST receive the identity from the single shared source of truth. No surface MUST carry a private palette or typeface, and no surface MUST be permitted to drift.
- **FR-014**: Dark appearance MUST remain supported and user-selectable on every surface. Because the source design defines light appearance only, a dark counterpart MUST be derived that preserves the identity's character and the distinction between surface levels, rather than being produced by inversion.
- **FR-015**: Every foreground and background pairing in the new palette MUST meet the platform's enforced contrast floor, verified automatically, in both appearances.
- **FR-015a**: Where the chosen design's own pairing of a foreground against a background fails the platform's contrast floor, the floor MUST win and the pairing MUST be adapted. Fidelity to the source MUST NOT be used to justify an accessibility exemption, and no exemption MUST be granted.
- **FR-016**: The constitution's design principle MUST be amended to record the new identity and retire the previous one, following the precedent already set for a retired palette.
- **FR-017**: The identity change MUST NOT alter any surface's structure, navigation, or behaviour; it changes appearance only.

### Brand Marks

- **FR-018**: Every committed brand asset — app icons, splash screens, and favicons across every branded surface — MUST be regenerated in the new identity from its authored source.
- **FR-019**: The existing drift check MUST continue to pass, MUST continue to fail on stale, orphaned, or missing assets, and MUST continue to name the offending surface.
- **FR-020**: Splash ground colours MUST be restated in the new identity for both appearances on every app that has one.
- **FR-021**: The mark MUST remain legible and unclipped at every committed size and inside every platform launcher mask shape.
- **FR-022**: Where surfaces were previously distinguished from one another by mark colourway, they MUST remain distinguishable by a means that does not depend on a brand hue.
- **FR-023**: Regeneration MUST remain deterministic: two runs from an unchanged source MUST produce identical output.
- **FR-024**: Platform rules governing icon asset format that exist to satisfy app store requirements MUST continue to be enforced and MUST NOT be weakened by the palette change.

### Customer Mobile Rebuild

- **FR-025**: Every screen the customer mobile app already has MUST be rebuilt in the new design language, covering launch, the full authentication flow, discovery, search and its states, refinement, product detail, cart and its empty state, checkout, order confirmation, order history and its states, saved items and its empty state, addresses, and the account area.
- **FR-025a** *(amended 2026-07-29, operator direction)*: "Rebuilt" means **REPLACED, not restyled**. The existing screen compositions MUST NOT be preserved and incrementally adjusted; each screen's layout MUST be composed to match the chosen design's corresponding screen — its app bar, spacing, hierarchy, controls, imagery treatment and content order. Where the existing composition differs from the source, the SOURCE wins. The operator's direction is explicit: none of the current UI is to be retained.
- **FR-025b**: FR-025a governs **presentation only**. Every screen MUST keep its existing ViewModel, use-cases and repository wiring intact (FR-001, Principle VI), and MUST retain the capabilities FR-026 lists — safe areas, loading skeletons, pull-to-refresh, transient confirmation, press feedback and reduced-motion handling. Those are requirements the platform already owes, not stylistic inheritance, and replacing a layout MUST NOT drop them.
- **FR-026**: The rebuild MUST preserve the presentation foundation established by the previous refresh — navigation iconography with persistent labels, title bars with standard back affordances, safe-area correctness, loading placeholders, pull-to-refresh, transient confirmation, press feedback, and reduced-motion handling. None of it MUST regress.
- **FR-027**: Category browse MUST be designed in the chosen design language even though the source has no such screen, and MUST be indistinguishable in style from directly derived screens.
- **FR-028**: The delivery-location and serviceability affordance MUST likewise be designed in the design language, and MUST continue to answer serviceability exactly as it does today.
- **FR-029**: Product ratings and reviews MUST NOT be introduced. The platform has no such capability and it was deliberately excluded previously.
- **FR-030**: The payment-method and card-entry steps MUST continue to be rendered by the payment provider's own sheet. No look-alike substitute MUST be built.
- **FR-030a**: Credential routes the platform does not offer MUST NOT be presented, regardless of the chosen design offering them. Only the customer audience's existing routes MUST appear.
- **FR-030b**: Every interactive control introduced or restyled MUST meet the platform's minimum touch-target size and MUST give press feedback. Because this feature replaces the styling of every control — chips, icon buttons, navigation items, quantity steppers — target size cannot be assumed to survive the restyle and MUST be verified rather than inherited.
- **FR-031**: The rebuild MUST work on both mobile platforms and across the supported device sizes and orientations, including tablets.
- **FR-031a**: Where the chosen design's primary navigation differs from the app's existing destination set, the difference MUST be settled as an explicit decision with a recorded rationale rather than absorbed silently as part of a restyle. Any change to the destination set MUST preserve reachability of every existing capability and MUST NOT introduce a new sign-in gate.
- **FR-032**: The customer web storefront MUST receive the identity change but MUST NOT receive a screen-level rebuild in this feature; the two customer surfaces MUST NOT be allowed to diverge on palette or typeface.

### New Screens

- **FR-033**: A first-launch introduction MUST be provided that can be advanced and skipped, and MUST NOT reappear on subsequent launches.
- **FR-034**: A notifications screen and its empty state MUST be provided.
- **FR-035**: Where a new screen stands on a capability the platform does not have, it MUST be populated with placeholder content that is evidently placeholder to the operator, and no placeholder MUST be presented to a shopper as a real event, order, or message.
- **FR-036**: Order tracking MUST be provided, presenting an order's progress as a sequence of states drawn from existing order data.
- **FR-037**: Order tracking MUST reveal no fulfilment location, no map of one, no courier identity, and nothing a shopper could not already obtain.
- **FR-038**: A help area MUST be provided covering common questions, help topics, and a contact route to a person.
- **FR-039**: Every screen introduced here MUST be reachable from a natural entry point in the app's navigation and MUST offer a way back.

### Accessibility and Verification

- **FR-040**: Meaning MUST never depend on colour. Every status, badge, availability, selected state, error, and destructive action MUST remain fully interpretable in grayscale by text, shape, icon, weight, or position.
- **FR-041**: Every interactive element on every surface MUST carry an accessible name, and dynamic changes MUST be announced to assistive technology.
- **FR-042**: Web surfaces MUST remain fully operable by keyboard alone, with a visible focus indicator against the new palette and no focus trap.
- **FR-043**: Every surface MUST remain usable at the platform's supported maximum text size with no clipped or unreachable control, including under the identity's tighter letter-spacing.
- **FR-044**: The public storefront MUST NOT regress its guest page-weight budget, its server-rendered-shell behaviour, or its search-engine visibility.
- **FR-045**: All existing automated checks across every surface and shared package MUST continue to pass unchanged.
- **FR-046**: The customer parity register MUST be updated to record what this feature delivers on each customer surface, including what is mobile-only by design.

## Key Entities

- **Visual identity**: the platform's complete design vocabulary — the neutral scale in both appearances, the typeface and its type scale, the spacing rhythm, and the radius scale. It has exactly one source of truth and every surface reads from it.
- **Brand mark**: the authored vector from which every committed icon, splash, and favicon is derived, together with the per-surface variants that distinguish one surface from another.
- **Screen mapping**: the correspondence between each screen in the chosen design language and each screen in the customer mobile app — including screens present in one and absent from the other in either direction, and screens deliberately excluded with a recorded reason.

## Scope

### In Scope

- Replacing the platform's brand accent, destructive colour, and typeface across all six surfaces from the single shared source of truth.
- Deriving a dark counterpart of the identity.
- Amending the constitution to record the new identity and retire the previous one, and adding the guard that keeps the retired one out.
- Regenerating every committed brand asset — app icons, splash screens, favicons, and splash ground colours — across every branded surface.
- Rebuilding every existing customer mobile app screen in the new design language.
- Designing category browse and the delivery-location affordance in the design language, neither of which the source provides.
- Building the screens the app lacks: first-launch introduction, notifications and its empty state, order tracking, and the help area.
- Accessibility verification across everything this feature touches, with particular attention to meaning without colour.
- Updating the customer parity register.

### Out of Scope

- Any change to commerce behaviour, pricing, delivery quoting, payment, order state, authorisation, routing, or stored data.
- Any new server capability.
- Product ratings, reviews, seller signals, or any new catalogue concept.
- Apparel-specific concepts including size selection.
- Replacing the payment provider's own payment-method and card-entry sheet.
- A screen-level rebuild of the customer web storefront, the shop web console, the shop mobile app, the driver mobile app, or the back-office console — all of which receive the identity change only.
- Delivering real notifications; the notifications screen presents placeholder content until a notifications capability exists.
- Cloud deployment of the hot path, which remains its own slice.

## Dependencies

- The single shared design vocabulary and its generation into every surface's theme, together with the runtime appearance preference.
- The enforced contrast check that gates the palette.
- The committed brand assets and their generation and drift-checking workflow.
- The mobile presentation foundation established by the previous customer refresh, which this feature inherits rather than rebuilds.
- The existing catalogue, search, cart, checkout, delivery, favourites, address, and order capabilities, all unchanged.
- The existing order progress states, which supply everything order tracking is permitted to show.
- The customer parity register.
- The chosen design source and its licence, which is an out-of-code dependency.

## Assumptions

- "Completely use this as our UI" means adopting the design language — palette, typeface, type hierarchy, spacing, imagery treatment, control styling, and screen structure — and adapting its content to Effy's grocery model. It does not mean reproducing an apparel catalogue.
- The identity is monochrome in the sense that it carries **no brand hue**, not in the sense that it has no colour at all. The chosen design declares exactly two semantic colours alongside its neutral scale — one for success and one for error and destruction — and both are retained. This is confirmed from the design's own published colour definition, not inferred. Every such colour remains subject to the rule that meaning must never depend on colour alone, which the chosen design already satisfies by pairing each with an icon and a word.
- Third-party sign-in marks that a provider's own brand guidelines require to be rendered in that provider's colours are a permitted exception to the no-brand-hue rule, and are the only such exception.
- Dark appearance is derived rather than specified, because the source defines light appearance only. The derivation aims to preserve the identity's character and its separation between surface levels rather than to invert its values.
- The typeface is assumed to be licensed for the platform's use. This is confirmed rather than presumed before any derived asset ships, and the finding is recorded.
- Surfaces previously distinguished by mark colourway are assumed to remain distinguishable through the mark itself — its form, weight, or neutral value — rather than through a hue.
- Order tracking presents the order progress the platform already records. It is a presentation of existing state, not a live courier feed, and the absence of a map or a courier identity is a deliberate consequence of the hidden-fulfilment model rather than a gap to be filled later.
- Placeholder content on new screens is a temporary state tied to a capability that does not exist yet, and each such screen carries a recorded owning slice for when it does.
- The first-launch introduction is a device-local preference; it is not an account record and does not sync between devices.
- The web storefront's screen-level presentation was addressed by the preceding refresh, so this feature changes its identity without revisiting its layout.
- Verification of visual quality is a structured review across a defined set of viewports, appearances, and platforms, plus the existing automated checks — not per-screen judgement.
- Delivering all five stories is preferred, but each is independently shippable in priority order, and Story 1 alone delivers the operator's chosen identity to every audience.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero occurrences of any retired brand colour remain reachable in authored source, tokens, generated themes, committed assets, or documentation across the entire repository, proven by an automated check that fails the build and names the surface when one is reintroduced.
- **SC-002**: 100% of visible colours, type sizes, weights, letter-spacing, spacing steps, and radii on every surface resolve to the shared design vocabulary, verified by inspection with no exceptions granted.
- **SC-003**: All six surfaces render the new typeface, and a side-by-side review of the same content on a mobile device and a desktop judges them to belong to one product.
- **SC-004**: Every foreground and background pairing in both appearances meets the platform's enforced contrast floor, with zero exemptions, verified automatically.
- **SC-005**: Every committed brand asset across every branded surface presents the new identity, the drift check passes, and it is proven still to fail by deliberately introducing a stale, an orphaned, and a missing asset — each failing and naming the correct surface.
- **SC-006**: Two full regenerations of the brand assets from an unchanged source produce byte-identical output.
- **SC-007**: The mark remains legible and unclipped at its smallest committed size and inside every platform launcher mask shape, confirmed on physical devices on both mobile platforms.
- **SC-008**: 100% of the customer mobile app's screens present the new design language, and a reviewer shown the source design and the app judges them to belong to the same system — including the two screens designed in its idiom with no source counterpart.
- **SC-009**: Zero apparel-specific concepts, zero rating or review affordances, and zero look-alike payment or card-entry screens are reachable in the customer mobile app.
- **SC-010**: Every screen introduced by this feature is reachable from a natural entry point, offers a way back, and presents a complete state for both populated and empty content.
- **SC-011**: Zero placeholder items are presented to a shopper as a real event, order, or message, and every screen carrying placeholder content is recorded against the slice that will make it real.
- **SC-012**: Order tracking discloses zero fulfilment locations, maps, or courier identities across every order state tested, including states reached by multi-package orders.
- **SC-013**: Every status, badge, availability, selected state, error, and destructive action remains correctly interpretable in a grayscale review, with zero meanings carried by colour alone.
- **SC-014**: Screen-reader traversal completes discovery, product evaluation, cart, checkout, orders, and every screen introduced here with zero unlabelled controls, zero focus traps, and zero unannounced dynamic changes; web surfaces additionally complete every journey by keyboard alone with focus always visible.
- **SC-015**: Every screen on both mobile platforms and every web surface passes visual inspection across the supported viewport set in both appearances, with zero clipped, overlapped, or unreachable content and zero essential content behind system bars, cutouts, or the keyboard — including at the platform's maximum supported text size.
- **SC-016**: The public storefront's guest page-weight budget, server-rendered-shell behaviour, and search-engine visibility are each measured after the change and are no worse than before it.
- **SC-017**: All existing automated checks across every surface and shared package pass unchanged, and no commerce, session, authorisation, or routing behaviour differs from before the feature.
- **SC-018**: The source design's licence and attribution requirement are confirmed and recorded before any derived asset ships.
- **SC-019**: The customer parity register records every capability this feature delivers on each customer surface, with mobile-only items explicitly marked as such rather than left outstanding.
- **SC-020**: Every interactive control on the rebuilt and new mobile screens meets the platform's minimum touch-target size, with zero exceptions, and every one gives press feedback.
- **SC-021**: The customer mobile app and the customer web storefront are distinguishable from the shop app and shop console by their brand marks alone — at launcher size, in a browser tab strip, and in grayscale — with zero observers mistaking one for the other.
