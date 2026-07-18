# Feature Specification: Shop Mobile UI Foundation

**Feature Branch**: `[018-shop-mobile-ui-foundation]`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Completely replace the shop mobile app's current presentation, beginning with modern authentication screens, a safe-area-aware app shell, and responsive primary navigation. The experience must be minimal, professional, inspired by Uber Eats and eBay, fully themed, spacious, animated, and adapted between a bottom navigation bar on smaller portrait screens and a side navigation rail on larger or landscape screens."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign In Through a Calm, Focused Flow (Priority: P1)

A provisioned shop operator opens the app and signs in using their work email and one-time code through a focused, modern flow that makes the next action obvious, handles the keyboard and system areas correctly, and clearly explains loading, invalid-code, expired-code, retry, and access-refused states.

**Why this priority**: Authentication is the only public experience and the gateway to every operator task. If it feels unfinished or becomes obscured by device chrome or the keyboard, the rest of the app cannot be trusted.

**Independent Test**: Start signed out on supported phone and tablet sizes, request a code, enter it, recover from one invalid attempt, and reach the signed-in shell without any protected content appearing before authentication succeeds.

**Acceptance Scenarios**:

1. **Given** a signed-out operator, **When** they open the app, **Then** they see a branded, focused email sign-in screen with one clear primary action and no protected shop content.
2. **Given** a valid provisioned email, **When** the operator requests a code, **Then** the flow advances with a short transition to a code-entry screen that identifies the destination email without exposing unnecessary personal data.
3. **Given** an incomplete or invalid email or code, **When** the operator attempts to continue, **Then** an inline, plain-language error appears without erasing valid input or moving layout unexpectedly.
4. **Given** an expired or incorrect code, **When** confirmation fails, **Then** the operator can correct the code or request another code and receives clear feedback about what happened.
5. **Given** valid credentials for an active, assigned operator, **When** confirmation succeeds, **Then** the authentication flow transitions into the signed-in shell and cannot be returned to with ordinary back navigation.
6. **Given** a valid credential whose operator record is refused, **When** identity verification completes, **Then** the operator sees a calm refusal state with a sign-out action and no internal authorization detail.

---

### User Story 2 - Navigate a Responsive, Safe App Shell (Priority: P2)

A signed-in shop operator moves between Home, Catalog, Orders, and Account using navigation that feels designed for the current screen rather than stretched from another device. System status and gesture areas remain visible and readable, and rotating or resizing the device does not lose the operator's place.

**Why this priority**: The shell establishes the spatial, interaction, and visual rules every later shop feature will inherit.

**Independent Test**: Sign in, visit every primary destination on a small portrait phone and a large or landscape device, rotate or resize while on a non-default destination, and confirm navigation placement, selection, system-area safety, and destination continuity.

**Acceptance Scenarios**:

1. **Given** a smaller portrait viewport, **When** the signed-in shell appears, **Then** the four primary destinations are presented in a well-spaced bottom navigation bar outside the content area.
2. **Given** a larger or landscape viewport with sufficient horizontal space, **When** the signed-in shell appears, **Then** the same destinations are presented in a well-spaced side navigation rail and the content uses the remaining width without dashboard-card filler.
3. **Given** the operator changes orientation or window size, **When** the navigation changes between bottom bar and rail, **Then** the selected destination and its meaningful navigation state are preserved.
4. **Given** the operator is on a nested destination, **When** they use system back, **Then** the current destination unwinds predictably before the app returns to Home or exits.
5. **Given** a device with a status bar, camera cutout, rounded corners, home indicator, or gesture navigation, **When** any authentication or shell screen is displayed, **Then** essential content and controls remain inside safe areas while the system status information stays visible and legible.
6. **Given** a navigation destination is selected, **When** the operator views the navigation bar or rail, **Then** selection is communicated by icon, label, shape, and contrast rather than color alone.

---

### User Story 3 - Experience a Modern and Coherent Interface (Priority: P3)

A shop operator experiences a restrained, professional interface whose hierarchy comes from typography, spacing, neutral surfaces, meaningful imagery or iconography, and purposeful semantic color. Transitions and feedback make the app feel responsive without distracting from work.

**Why this priority**: The existing experience is being replaced because its component-heavy appearance, cramped spacing, excessive green, and static transitions undermine operator confidence.

**Independent Test**: Review all authentication states and each shell destination in light and dark appearance, exercise taps and destination changes, enable reduced motion, and compare the result against the visual and interaction principles in this specification.

**Acceptance Scenarios**:

1. **Given** either light or dark appearance, **When** a screen is rendered, **Then** neutral backgrounds and surfaces establish hierarchy while brand and semantic colors are used only for their defined purposes.
2. **Given** a primary action, supporting action, selected item, focus state, muted detail, or destructive state, **When** it appears, **Then** it uses the corresponding existing theme role with accessible text/icon support and no hardcoded or improvised color.
3. **Given** the operator taps a control or changes destinations, **When** the interface responds, **Then** it provides subtle press, selection, loading, or page-transition feedback appropriate to the action.
4. **Given** reduced motion is enabled, **When** the same interactions occur, **Then** movement is removed or simplified without hiding state changes or delaying task completion.
5. **Given** a screen has little or no content, **When** it is displayed, **Then** it uses concise copy, intentional whitespace, and an optional focused action rather than empty metric cards or decorative containers.
6. **Given** a screen reader, larger text, or increased contrast setting, **When** the operator navigates the authentication and shell flows, **Then** labels remain meaningful, focus order remains logical, text remains readable, and controls remain operable.

---

### User Story 4 - Begin Again Without Legacy Presentation (Priority: P4)

The product team can build later shop workflows on a clean visual foundation without accidentally retaining fragments of the rejected dashboard, catalog, detail, or bottom-sheet presentation.

**Why this priority**: A partial reskin would preserve the structural problems the reset is intended to eliminate.

**Independent Test**: Inspect every reachable screen after sign-in and confirm that only the new authentication and shell foundation is presented; unfinished feature destinations use intentional foundation placeholders and no legacy catalog or product-creation interface can be opened.

**Acceptance Scenarios**:

1. **Given** the reset is delivered, **When** the operator navigates through every reachable destination, **Then** no legacy dashboard card, catalog list/detail layout, letter-based navigation glyph, or product-creation bottom sheet remains visible or reachable.
2. **Given** Catalog or Orders has not yet been rebuilt on the new foundation, **When** the operator selects it, **Then** a polished, clearly labeled temporary state appears within the new shell rather than the old feature UI.
3. **Given** the existing authentication, session, role, and authorization behavior, **When** the presentation is replaced, **Then** those product and security behaviors remain unchanged.

### Edge Cases

- A hardware or software keyboard opens on a short screen, including landscape phone orientation.
- The operator pastes a one-time code containing spaces or uses automatic code completion.
- Code delivery is slow, repeated requests are temporarily unavailable, or the network disappears mid-flow.
- The app restores a session while the device rotates or changes window size.
- A session expires while the operator is on a non-default destination.
- Text scaling causes navigation labels or authentication instructions to need more space.
- The device uses a display cutout, rounded display, translucent system bars, gesture navigation, or a high-contrast system theme.
- The available width sits close to the point where primary navigation changes form.
- The operator taps destinations repeatedly during a transition.
- Appearance changes between light, dark, and system-following while the app is active.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The shop mobile app MUST replace its current reachable presentation with a new visual foundation; this MUST be a structural reset rather than a color-only reskin.
- **FR-002**: This feature MUST deliver only the authentication experience, session states, app shell, responsive primary navigation, and intentional destination placeholders needed to prove the foundation.
- **FR-003**: Existing authentication method, session persistence, cross-audience isolation, operator identity validation, role interpretation, backend-authoritative access decisions, and explicit sign-out behavior MUST remain unchanged.
- **FR-004**: Signed-out operators MUST be able to request and confirm a one-time email code without encountering a password, self-registration, or public-account flow.
- **FR-005**: Authentication MUST provide distinct, comprehensible states for initial entry, code entry, submission in progress, invalid input, delivery failure, invalid or expired code, resend availability, successful sign-in, session restoration, and refused access.
- **FR-006**: Authentication screens MUST maintain a single clear primary action, preserve useful input after recoverable errors, and remain usable when the on-screen keyboard is visible.
- **FR-007**: Protected shell content MUST never be visible or reachable while signed out, restoring a session, or refused.
- **FR-008**: The signed-in shell MUST expose exactly four primary destinations: Home, Catalog, Orders, and Account.
- **FR-009**: The shell MUST present primary navigation as a bottom bar on smaller portrait layouts and as a side rail when a larger or landscape layout provides sufficient horizontal space.
- **FR-010**: The switch between bottom navigation and navigation rail MUST be based on usable space and posture, MUST occur without restarting the signed-in experience, and MUST preserve the selected destination.
- **FR-011**: Every navigation destination MUST use a meaningful production-quality icon and persistent text label; letter placeholders are prohibited.
- **FR-012**: Navigation controls MUST have consistent alignment, rhythm, safe-area separation, and touch-friendly target sizes, with selection indicated by more than color alone.
- **FR-013**: System status information and system navigation/gesture affordances MUST remain visible, legible, and outside essential content on every authentication, loading, refusal, and signed-in screen.
- **FR-014**: The interface MUST adapt to display cutouts, rounded corners, system bars, keyboard insets, orientation changes, and supported phone/tablet window sizes without clipped or unreachable content.
- **FR-015**: The new visual hierarchy MUST be inspired by Uber Eats' task-first simplicity and eBay's information-rich commerce patterns, adapted to Effy's internal shop-operator context and original brand identity; it MUST NOT copy either product's trade dress.
- **FR-016**: Layout MUST favor clear page titles, lists, rows, dividers, tabs, and whitespace; tiled dashboards, top-of-page metric cards, and decorative card grids are prohibited unless a later feature demonstrates a content-specific need.
- **FR-017**: Spacing MUST follow a consistent rhythm across screen edges, sections, rows, form fields, controls, bottom navigation, and navigation rail, with denser layouts permitted only where scanability improves.
- **FR-018**: Typography MUST establish a clear hierarchy for page titles, section titles, body copy, metadata, labels, and validation messages without relying on color or container borders for structure.
- **FR-019**: All visible colors MUST come from the shared theme and MUST use semantic roles consistently across light and dark appearances.
- **FR-020**: Neutral theme roles MUST carry backgrounds, surfaces, borders, and most text; Effy Emerald MUST identify brand, selected navigation, focus, and primary actions; secondary, muted, and accent roles MUST support lower-emphasis controls, selection surfaces, metadata, and interaction feedback; terracotta/error roles MUST identify destructive or critical states.
- **FR-020a**: When the current theme has no dedicated color role for a status such as success, warning, or information, the interface MUST use clear text, iconography, shape, and an appropriate existing neutral role rather than inventing or hardcoding a new status color.
- **FR-021**: The interface MUST NOT use one accent color for unrelated actions, statuses, containers, and decoration, and MUST NOT communicate meaning through color alone.
- **FR-022**: Light, Dark, and Follow-System appearance modes MUST remain supported, with readable system bars and controls in each mode.
- **FR-023**: Authentication progression, session-to-shell entry, destination changes, nested navigation, control presses, loading changes, and selection changes MUST use purposeful micro-interactions or transitions that clarify cause and effect.
- **FR-024**: Motion MUST be brief, interruptible, and free of gratuitous looping; repeated taps MUST NOT stack transitions or leave navigation in an inconsistent state.
- **FR-025**: Reduced-motion preferences MUST be honored by removing or simplifying nonessential movement while retaining immediate state feedback.
- **FR-026**: All controls MUST provide pressed, focused, disabled, loading, and error feedback where applicable.
- **FR-027**: Authentication and shell navigation MUST remain operable with screen readers, larger text, increased contrast, and non-color cues, with meaningful labels and logical focus order.
- **FR-028**: The legacy dashboard, catalog list/detail presentation, letter navigation glyphs, and product-creation bottom sheet MUST be removed from the reachable app experience in this feature rather than hidden behind alternate entry points.
- **FR-029**: Catalog, product detail, product creation/editing, orders, inventory, media, and operational dashboard UI redesigns are OUT OF SCOPE and MUST be specified as later features built on this foundation.
- **FR-030**: Until those later redesigns land, unfinished primary destinations MUST show polished, minimal placeholders that state what the area is for without presenting invented data or nonfunctional controls.
- **FR-031**: The future product creation flow MUST be treated as a dedicated full-screen workflow rather than a bottom sheet; implementing that workflow is outside this feature.
- **FR-032**: The reset MUST NOT remove or redefine existing domain data, backend behavior, stored product data, or authorization guarantees merely because their current presentation is being retired.

## Visual Direction and Reference Findings

- **Uber Eats influence**: task-first hierarchy, strong typography, predictable primary navigation, prominent next actions, restrained decoration, accessible interaction foundations, and motion that supports high-cognitive-load real-world work.
- **eBay influence**: full-page selling/listing journeys, progressive completion, scannable product information, persistent search/filter patterns, and status that remains understandable without relying on color alone.
- **Effy adaptation**: an internal operations surface should be calmer and denser than a consumer discovery feed, but must retain the same clarity, touch quality, responsive behavior, and commerce-grade information hierarchy.
- **Rejected direction**: generic component-gallery styling, uniform outlined boxes, overuse of filled green surfaces, card-tiled dashboards, cramped rails, ambiguous glyphs, inset complex forms, and instantaneous screen swaps with no feedback.

## Scope

### In Scope

- Complete replacement of the currently reachable shop-mobile presentation.
- Session restoration, signed-out, code-entry, submission, error, refused, and signed-in transition states.
- New app shell and responsive Home/Catalog/Orders/Account primary navigation.
- New Home and Account foundation screens sufficient to validate hierarchy and sign-out.
- Polished placeholders for feature areas awaiting their dedicated redesign.
- Safe areas, visible system bars, keyboard behavior, appearance modes, accessibility, micro-interactions, and page transitions.

### Out of Scope

- Redesigning or restoring the catalog list, product detail, focused editing, product lifecycle, product sections, media, inventory, or order-management workflows.
- Implementing the future full-screen product creation workflow.
- Changing authentication credentials, user provisioning, roles, permissions, service behavior, or stored business data.
- Rebuilding the shop web surface.
- Copying Uber Eats or eBay branding, layouts, assets, or trade dress.

## Dependencies

- The existing shop operator authentication, session, identity, role, and manager-access behavior.
- The existing shared Effy theme, including its light/dark semantic color roles, typography, spacing, and radius vocabulary.
- The existing four primary shop navigation destinations and their per-destination history expectations.
- Existing device and capability coverage for Android phones/tablets and iPhones/iPads.
- Later specifications will rebuild catalog and operational workflows on this foundation.

## Assumptions

- "Completely remove" means replacing the presentation layer and all reachable legacy UI while preserving proven domain, data, security, and session behavior.
- Home may show operator/shop context and a small number of genuine next actions, but it will not contain invented metrics or summary-card filler.
- Catalog and Orders remain primary destinations so the information architecture does not churn; they temporarily show foundation-quality placeholders until their dedicated redesigns land.
- Responsive navigation chooses the form that best fits usable space; orientation is an important signal but not the sole determinant.
- Theme colors are used by meaning, not by quota: every relevant semantic color is used when its corresponding state exists, while neutral roles dominate normal surfaces.
- Product creation will be specified later as a dedicated, recoverable, full-screen multi-step journey.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, at least 90% of provisioned operators complete the email-code sign-in flow without assistance on their first attempt, excluding time spent waiting for email delivery.
- **SC-002**: Every authentication, refusal, loading, Home, Catalog placeholder, Orders placeholder, and Account state passes visual inspection on representative small portrait phone, landscape phone, portrait tablet, and landscape tablet sizes with zero essential content obscured by system bars, cutouts, gesture areas, or the keyboard.
- **SC-003**: In 100% of orientation and window-size transition tests, the selected primary destination is preserved and navigation changes form without exposing signed-out content or resetting the session.
- **SC-004**: All four primary destinations are identifiable by both icon and text, all interactive targets meet the platform's touch-size expectations, and all selected/error/status meanings remain understandable in grayscale.
- **SC-005**: Across light and dark appearance reviews, 100% of visible colors map to an approved theme role and no screen uses Emerald as a general-purpose background or as the only means of hierarchy.
- **SC-006**: Every primary tap, authentication progression, destination change, loading completion, and navigation selection provides perceivable feedback, while reduced-motion testing completes the same tasks without nonessential movement.
- **SC-007**: Screen-reader traversal completes the email-code sign-in and visits all four primary destinations with no unlabeled controls, trapped focus, or illogical reading-order blocker.
- **SC-008**: A product review of the delivered foundation rates visual hierarchy, spacing, navigation clarity, and perceived modernity at least 4 out of 5 in both phone and tablet layouts.
- **SC-009**: No legacy dashboard card, catalog list/detail presentation, letter navigation glyph, or product-creation bottom sheet is reachable after the foundation reset.
- **SC-010**: Existing automated and manual authentication, session restoration, sign-out, role visibility, manager denial, and cross-audience isolation checks continue to pass with no behavior regression.
