# Feature Specification: Monochrome Consoles & Shop Mobile — Unified Dashboard Identity

**Feature Branch**: `[041-monochrome-console-redesign]`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Change the shop apps to have the same monochrome design and theme as the customer app. Completely replace the current theme of the shop mobile and web apps with the monochrome theme/design. The shop-web and back-office web consoles must use the shadcn 'dashboard' example structure/layout together with the supplied monochrome theme values (find the shadcn install command/code for that dashboard and use it). The shop mobile app only needs its colour theme changed to monochrome. Full permission to refactor the web apps to fit this structure and theme."

## Context

Effy's customer surfaces already speak one monochrome visual language — a neutral ramp where near-black and near-white carry every accent role, with only two semantic states (error, success). The operator now wants the platform's **internal operator surfaces** to look and feel the same: the **shop web console** (`shop-web`), the **back-office admin console** (`back-office`), and the **shop mobile app** (`shop-mobile`).

Two of these three surfaces are near-identical web consoles that today share one internal console shell (a sidebar-and-header layout). The operator has selected a specific reference layout — the shadcn **dashboard** example — as the structure both consoles should adopt, and has supplied an exact set of appearance values to drive it. The decision (recorded below) is to adopt those supplied values **exactly** as the platform's visual identity, and to rebuild the two consoles onto the reference dashboard structure. The shop mobile app is not being restructured — only its colours are brought onto the same monochrome identity.

Because the platform keeps its design tokens in **one shared source of truth** that every surface reads from, updating those values is a platform-wide governance act, not a per-app edit. This feature therefore has a governance half (adopt the supplied identity as the shared tokens, with the constitutional change that entails) and a presentation half (rebuild the two consoles on the reference dashboard structure and re-skin shop mobile), validated so that the surfaces already on the monochrome identity remain visually equivalent.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shop operator works in the new monochrome dashboard console (Priority: P1)

A provisioned shop operator signs into the shop web console and finds every screen — sign-in, home/overview, catalog, order fulfillment, shop identity/account — presented in the reference dashboard structure (a persistent side navigation, a consistent top header, and a main content area laid out in the reference's idiom) and rendered entirely in the monochrome identity, in both light and dark appearance.

**Why this priority**: The shop console is a primary internal operator surface and the clearest expression of the requested change. Delivering it alone proves both halves of the feature — the adopted theme values and the reference dashboard structure — on a real, in-use console.

**Independent Test**: Sign in to the shop web console and walk every existing screen; confirm each is laid out in the new dashboard structure and uses only the monochrome identity (plus the two semantic states and the adopted chart colours where data is charted), in both light and dark, with no legacy accent colour remaining.

**Acceptance Scenarios**:

1. **Given** a signed-in shop operator on any shop-web screen, **When** they view the page, **Then** it presents in the reference dashboard structure (persistent side navigation + top header + main content region) and uses only the adopted monochrome identity for surfaces, text, borders, and interactive accents.
2. **Given** the appearance is switched between Light, Dark, and Follow-System, **When** any shop-web screen renders, **Then** the monochrome identity is preserved and all text meets accessibility contrast in both appearances.
3. **Given** any previously shipped shop-web screen, **When** it is compared to before this feature, **Then** its content and function are unchanged while its layout follows the new structure and its colours follow the new identity.

---

### User Story 2 - Back-office admin works in the same dashboard structure and identity (Priority: P2)

A back-office administrator signs into the admin console and finds the same dashboard structure and the same monochrome identity as the shop console — sign-in, dashboard/overview, and every existing management area (shops, staff, catalog schema, promotions, deliverability) — so the two internal consoles read as one product.

**Why this priority**: The back-office console is the second internal web surface and the operator explicitly asked that both consoles use this structure. It reuses the shared console foundation delivered in P1, so it is high value but dependent.

**Independent Test**: Sign in to the back-office console and walk every existing management area; confirm each uses the same dashboard structure and monochrome identity as shop-web, in both appearances.

**Acceptance Scenarios**:

1. **Given** a signed-in administrator on any back-office screen, **When** they view the page, **Then** it presents in the same dashboard structure and monochrome identity as the shop console.
2. **Given** the shop and back-office consoles are viewed side by side, **When** an observer compares them, **Then** they are recognisably the same visual system, differing only in navigation content and data.

---

### User Story 3 - Shop mobile operator sees the monochrome identity (Priority: P3)

A shop operator opens the shop mobile app and sees every screen rendered in the monochrome identity, matching the customer app's appearance, in both light and dark — without any change to the app's navigation structure or screen flow.

**Why this priority**: Shop mobile is scoped to a colour change only (no structural rebuild), so it is the smallest slice and can land after the consoles. It completes the "shop apps match the customer app" goal.

**Independent Test**: Open the shop mobile app on a device and walk its existing screens; confirm each renders in the monochrome identity in both appearances, with the app's structure and flows unchanged.

**Acceptance Scenarios**:

1. **Given** the shop mobile app, **When** any existing screen renders, **Then** it uses only the monochrome identity (plus the two semantic states), matching the customer mobile app's appearance.
2. **Given** the appearance is switched between Light, Dark, and Follow-System, **When** any shop-mobile screen renders, **Then** the monochrome identity is preserved and legibility holds in both appearances.
3. **Given** the shop mobile app after this feature, **When** its navigation and screen flow are exercised, **Then** they are unchanged from before — only colours differ.

---

### Edge Cases

- **Surfaces already on the monochrome identity** (customer web, customer mobile, driver mobile): because the identity lives in one shared source of truth, adopting the supplied values changes the shared tokens for these surfaces too. The change MUST be validated to leave them **visually equivalent** — the neutral ramp they already use must not shift perceptibly, and no new off-identity colour may appear on them.
- **Data visualisation**: the adopted values introduce a set of chart colours that are not part of the prior two-state palette. Where a console charts data, these adopted chart colours are the only place non-monochrome colour is permitted; nowhere else may they be used as an accent.
- **Legacy accent colours**: any remaining retired brand colour (previous emerald/terracotta/jade) on the in-scope surfaces MUST be removed as part of this change; none may survive on any refreshed screen.
- **Appearance switching**: a surface set to Follow-System must track OS light/dark changes live; a user-selected Light or Dark must persist.
- **Empty / loading / error states**: skeletons, empty states, and error states on refreshed screens must also render in the new identity, not fall back to a prior palette.
- **Governance guard drift**: the automated design-token guards that currently enforce the prior (stricter) palette rules must be reconciled to the adopted values, and must still fail loudly on any *unapproved* colour.

## Requirements *(mandatory)*

### Functional Requirements

#### Theme adoption (platform-wide, governance)

- **FR-001**: The platform's single shared design-token source of truth MUST be updated to the operator-supplied appearance values **exactly**, for both light and dark appearances, as the platform's visual identity.
- **FR-002**: The adopted values MUST become the identity for **all** surfaces that read the shared source of truth; the change MUST be validated so that surfaces already on the monochrome identity (customer web, customer mobile, driver mobile) remain **visually equivalent** after adoption.
- **FR-003**: Because the adopted values relax the platform's existing "monochrome, exactly two semantic hues" rule (they introduce chart colours and pin a different corner radius), the platform's governing document (constitution) MUST be amended to permit them before the change is considered complete. *(This is a required dependency of the feature; see Assumptions.)*
- **FR-004**: The automated design-token guards MUST be reconciled to the adopted values — permitting exactly the adopted colours/radii while still failing loudly on any colour not in the adopted set — and MUST continue to enforce text-contrast accessibility in both appearances.
- **FR-005**: Every retired brand accent colour MUST be absent from all in-scope surfaces after this feature; no legacy accent may remain on any refreshed screen.

#### Shop web console (`shop-web`) — P1

- **FR-006**: The shop web console MUST adopt the operator-selected reference **dashboard** structure (persistent side navigation, consistent top header, main content region laid out in the reference idiom) as the shell for its authenticated screens.
- **FR-007**: Every existing shop-web screen (sign-in, home/overview, catalog, order fulfillment, shop identity/account) MUST be presented within the new structure without loss of existing content or function.
- **FR-008**: Every shop-web screen MUST render exclusively in the adopted monochrome identity (surfaces, text, borders, interactive accents), reserving colour only for the two semantic states and the adopted chart colours where data is charted.
- **FR-009**: The shop-web console MUST support Light, Dark, and Follow-System appearances, preserving the identity and legibility in each.

#### Back-office console (`back-office`) — P2

- **FR-010**: The back-office console MUST adopt the same reference dashboard structure as the shop console, reusing the shared console foundation rather than a divergent implementation.
- **FR-011**: Every existing back-office management area (sign-in, dashboard/overview, shops, staff, catalog schema, promotions, deliverability) MUST be presented within the new structure without loss of existing content or function.
- **FR-012**: Every back-office screen MUST render exclusively in the adopted monochrome identity under the same rules as FR-008, and MUST support Light, Dark, and Follow-System appearances.
- **FR-013**: The two consoles MUST read as one visual system, differing only in navigation content and data.

#### Shop mobile app (`shop-mobile`) — P3

- **FR-014**: The shop mobile app MUST render every existing screen in the adopted monochrome identity, matching the customer mobile app's appearance, in both light and dark.
- **FR-015**: The shop mobile change MUST be limited to appearance (colour/theme); the app's navigation structure and screen flows MUST NOT change.
- **FR-016**: The shop mobile app MUST preserve its Light / Dark / Follow-System appearance selection behaviour.

#### Cross-cutting

- **FR-017**: The reference dashboard structure and the adopted identity MUST come from the platform's shared foundations (the shared console shell and the shared design tokens), not be copy-pasted per app, so a future change is made in one place.
- **FR-018**: No functional/business behaviour of any in-scope surface (auth, data reads/writes, permissions, flows) may change as a result of this feature; it is a presentation-and-identity change only.

### Key Entities

*Not applicable — this feature introduces no new data entities. It changes presentation (shared design tokens, the shared console structure, and per-surface theming) only.*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing shop-web and back-office screens present in the new dashboard structure and the adopted monochrome identity, in both light and dark appearances.
- **SC-002**: 100% of existing shop-mobile screens render in the adopted monochrome identity in both appearances, with zero change to navigation structure or screen flow.
- **SC-003**: An independent observer viewing shop-web, back-office, and the customer app together identifies them as one visual system on first look, in 5 out of 5 trials.
- **SC-004**: Zero occurrences of any retired brand accent colour remain on any in-scope surface (verified by the platform's colour guards).
- **SC-005**: All text on every refreshed screen meets the platform's accessibility contrast bar in both light and dark appearances, with zero exemptions.
- **SC-006**: Surfaces already on the monochrome identity (customer web, customer mobile, driver mobile) are visually equivalent before and after the token change — no perceptible shift and no new off-identity colour.
- **SC-007**: Colour beyond the monochrome ramp appears only as the two semantic states and, within charts, the adopted chart colours; it appears nowhere else on any refreshed screen.
- **SC-008**: The design-token and structure foundations are shared such that changing an appearance value or the shell in one place propagates to every consuming surface (demonstrated by a single-source change reaching all consumers).

## Assumptions

- **The operator-supplied values are adopted exactly and platform-wide.** The pasted appearance values (light + dark) become the shared token source of truth verbatim, including the chart colours, the semantic destructive state, the sidebar values, and the pinned corner radius. This was confirmed in clarification (chosen over keeping the prior stricter monochrome tokens).
- **A constitution amendment is a required, in-scope dependency.** The adopted values relax the current "monochrome + exactly two semantic hues + pinned platform radii" rule by introducing chart colours and a different radius. The governing document must be amended (via the platform's constitution workflow) to permit them; this feature is not complete until that amendment lands. The amendment is expected to bound the new chart colours to data-visualisation use only.
- **"Structure" means the shadcn `dashboard` example.** The reference layout is the shadcn dashboard example the operator linked; the implementing plan is responsible for identifying the exact shadcn blocks/components and install steps and adapting them to the two consoles. Structural rebuild applies to shop-web and back-office only.
- **Shop mobile is a colour-only change.** No screens are added, removed, or restructured on shop mobile; only its theme is brought onto the monochrome identity. The mobile theme is derived from the same shared tokens, so it inherits the adopted values automatically.
- **The two web consoles already read the shared monochrome tokens** and already use a shared console shell; this feature replaces that shell's structure with the reference dashboard structure and re-skins to the adopted values, rather than building consoles from scratch.
- **Because the token SSOT is shared, the customer surfaces are re-tokened too.** They are already monochrome, so the adopted values are expected to leave them visually equivalent; validating that equivalence (SC-006) is part of the feature rather than a separate effort.
- **No backend, data, infrastructure, or auth changes.** This is a presentation-and-identity feature; all in-scope surfaces keep their current behaviour, permissions, and data flows.
- **Appearance selection (Light / Dark / Follow-System) already exists** on the web and mobile surfaces and is retained; this feature does not add or remove that capability.
