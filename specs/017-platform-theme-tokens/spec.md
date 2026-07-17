# Feature Specification: Platform Theme & Design Tokens Refresh

**Feature Branch**: `017-platform-theme-tokens`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Modify the platform theme. We currently have one color theme (emerald + white/black); introduce a richer, more professional multi-color theme from the supplied token set (forest-green accent, terracotta, neutral greys, surfaces, Outfit typography, spacing + radius scales). Decide dark-mode values. Every web app and mobile app MUST share the exact same theme, with a runtime theme switcher."

## Overview

Effy's visual identity today is a single accent (Jade `#0FB57E`) over neutral surfaces, with dark mode driven only by the device/OS setting. This feature replaces that with a **richer, professional brand palette** — a deep forest-green accent, a warm terracotta accent, structured neutral greys, dedicated surface/text/icon/border roles, the **Outfit** typeface, and defined spacing and radius scales — and adds a **user-controllable appearance switcher** (Light / Dark / Follow-System) on every surface.

The change is **presentation-only**: no layout structure, content, flows, data, or backend behavior change. It is deliberately cross-cutting — the whole point is that all six client surfaces (three web, three mobile) look and behave identically, driven from one shared source of truth.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unified new brand palette across every surface (Priority: P1)

Every Effy surface — customer web and mobile, shop web and mobile, driver mobile, and the back-office console — renders in the new brand palette (forest-green accent, terracotta, structured greys, Outfit typeface, new spacing/radius), in both light and dark appearances, with no trace of the retired Jade look.

**Why this priority**: This is the feature's core value and its foundation. Without a single, correct, applied palette there is nothing to switch between and no consistency to guarantee. Delivered alone it already gives the platform a cohesive, professional new identity (dark still following the device setting, as today).

**Independent Test**: Open each of the six surfaces in light and in dark and confirm the accent, surfaces, text, icons, borders, typography, and corner radii all match the new token set — and that no screen still shows Jade green or the old typeface.

**Acceptance Scenarios**:

1. **Given** any surface in light appearance, **When** a screen is displayed, **Then** its primary actions, surfaces, text, icons, and borders resolve to the new brand tokens (forest-green accent, defined greys, Outfit type).
2. **Given** any surface in dark appearance, **When** a screen is displayed, **Then** every element uses the dark variant of the same semantic tokens and remains legible.
3. **Given** two different surfaces showing an equivalent element (e.g., a primary button), **When** compared side by side in the same appearance, **Then** they are visually identical in color, type, and radius.
4. **Given** any surface after the change, **When** the UI is inspected, **Then** the retired Jade brand value appears nowhere.

---

### User Story 2 - User-controllable appearance switcher (Priority: P2)

A person using any Effy surface can choose whether they see Light, Dark, or the device's own setting (Follow-System), and that choice sticks the next time they return.

**Why this priority**: It is the "runtime theme switcher" the platform asked for and a meaningful usability upgrade over today's OS-only dark mode, but it depends on the palette (US1) existing first. It is independently valuable and demonstrable once US1 is in place.

**Independent Test**: On each surface, change the appearance to Light, to Dark, and to Follow-System; confirm the whole surface updates immediately, that Follow-System tracks the device setting, and that the choice is remembered after relaunch/reload.

**Acceptance Scenarios**:

1. **Given** a surface in any appearance, **When** the user selects a different mode (Light / Dark / Follow-System), **Then** the entire surface updates immediately without a reload or restart.
2. **Given** a user who selected Dark, **When** they relaunch the app or reload the page, **Then** the surface opens in Dark.
3. **Given** a user set to Follow-System, **When** the device switches between light and dark, **Then** the surface follows the change.
4. **Given** the appearance control, **When** it is used on any of the six surfaces, **Then** it offers the same three choices and behaves the same way.
5. **Given** a first-time user who has never chosen a mode, **When** they open any surface, **Then** it defaults to Follow-System.

---

### User Story 3 - Guaranteed cross-surface consistency & no drift (Priority: P3)

The theme is defined exactly once and consumed everywhere, so a change to a token propagates to all six surfaces, and no surface can silently drift to its own colors, fonts, or spacing.

**Why this priority**: This is the durability guarantee behind the platform's "every app MUST have the same theme" requirement. It protects the investment of US1/US2 over time, but the platform is already valuable once the palette and switcher ship.

**Independent Test**: Change one token at the source and confirm every surface (web and mobile) reflects it after its normal build; run the consistency check that fails if any surface hardcodes a brand color, font, or spacing value, or if a mobile surface's tokens diverge from the source.

**Acceptance Scenarios**:

1. **Given** the single source of theme tokens, **When** a token value is changed there, **Then** every surface reflects the new value with no per-surface edits.
2. **Given** the mobile surfaces, **When** their token definitions are checked against the source, **Then** they match exactly (no hand-maintained divergence).
3. **Given** any surface, **When** it is audited for hardcoded brand colors, fonts, or spacing outside the token system, **Then** none are found.

---

### Edge Cases

- **Follow-System with no device support**: On a platform or browser that cannot report a light/dark preference, Follow-System resolves to Light (documented default) and the user can still force Light or Dark.
- **Forced-colors / high-contrast OS modes**: The theme must not break usability when the OS overrides colors; text must remain readable.
- **Terracotta legibility**: The warm terracotta accent must be verified for contrast in both appearances (it is easy to under-contrast on light surfaces).
- **Preference scope**: A user's appearance choice is remembered per surface/device locally; it does **not** sync across a person's web and mobile installs (cross-device sync is out of scope this slice).
- **In-flight sessions**: Changing appearance mid-task must not lose the user's place or data.
- **Retired brand references**: Any asset, illustration, or one-off screen that baked in the old Jade must be caught and updated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST define one canonical set of design tokens — colors, typography, spacing, and radii — as the single source of truth consumed by every surface.
- **FR-002**: The token set MUST express the new brand palette from the supplied definition: a forest-green accent family (`#26483a` and its darker/lighter relatives), a terracotta accent (supplied `#d0735a`, AA-tuned to the nearest passing value per the contrast gate FR-004), structured neutral greys, and dedicated surface, text, icon, and border roles — replacing the retired Jade palette.
- **FR-003**: Every semantic token MUST define both a **light** and a **dark** variant; the dark variant MUST be a deliberate, brand-preserving mapping (not a mechanical inversion) and MUST be defined as part of this feature since the supplied set is light-focused.
- **FR-004**: All text-on-surface and interactive-element color pairings MUST meet WCAG 2.1 AA contrast (≥4.5:1 normal text, ≥3:1 large text and UI affordances) in **both** light and dark.
- **FR-005**: Typography MUST use the **Outfit** typeface for both body and title roles, applying the defined size and line-height scale, on every surface.
- **FR-006**: The defined spacing scale and radius scale (including the pill radius) MUST be available as tokens and used for layout metrics and corner rounding across surfaces.
- **FR-007**: Every current and future Effy client surface — customer web, shop web, back-office, customer mobile, shop mobile, driver mobile — MUST render using these shared tokens; no surface may define its own palette or hardcode brand colors, fonts, or spacing.
- **FR-008**: The mobile surfaces' token definitions MUST be **derived from the same source** as the web tokens (generated, not hand-maintained) and guarded so divergence from the source is detected automatically.
- **FR-009**: A user MUST be able to choose an appearance mode — **Light**, **Dark**, or **Follow-System** — on every surface.
- **FR-010**: A user's chosen appearance MUST persist across app relaunches and page reloads and MUST take effect immediately, without a reload or restart.
- **FR-011**: The appearance control MUST offer the same three choices and behave identically on all six surfaces.
- **FR-012**: When set to Follow-System, a surface MUST reflect the device/OS appearance and update live if the device setting changes.
- **FR-013**: For a user who has never made a choice, every surface MUST default to Follow-System.
- **FR-014**: The change MUST be presentation-only: it MUST NOT alter layout structure, content, navigation, flows, or data, and MUST continue to honor the platform's no-card-layout doctrine.
- **FR-015**: After the change, the retired Jade brand value MUST NOT appear on any surface or in any shared asset.
- **FR-016**: Replacing the brand accent changes a value currently fixed by the platform's governing brand definition; this feature MUST update that governing definition to the new brand as a prerequisite of shipping (governance dependency).

### Key Entities *(include if feature involves data)*

- **Design token**: A named, semantic design value (e.g., "primary button surface", "secondary text", "medium radius", "large spacing") that maps to a concrete value per appearance. The atomic unit of the theme.
- **Semantic role**: The meaning a token carries (surface, button, text, icon, border; primary/secondary/accent/disabled/red variants) rather than a raw color — so surfaces reference intent, not hex codes.
- **Appearance variant**: The light or dark resolution of the full token set.
- **Appearance preference**: A user's chosen mode (Light / Dark / Follow-System), stored locally per surface, defaulting to Follow-System.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the platform's **built** client surfaces (customer-web, back-office, shop-web, customer-mobile, shop-mobile) render the new brand palette (accent, surfaces, text, icons, borders), Outfit typography, and the new radius scale in both light and dark; **driver-mobile inherits the shared tokens when it is built** (no per-surface exception).
- **SC-002**: 0 hardcoded brand colors, fonts, or spacing values exist outside the shared token system on any surface (verified by audit/guard).
- **SC-003**: Every text/surface and interactive pairing passes WCAG 2.1 AA contrast in both appearances — 0 failures.
- **SC-004**: An equivalent element (e.g., primary button) is visually consistent in color, type, and radius across any two surfaces in the same appearance.
- **SC-005**: A user's appearance choice persists across relaunch/reload on 100% of surfaces, and switching takes visible effect with no reload or restart.
- **SC-006**: Follow-System correctly tracks the device setting on 100% of surfaces that can report it, and resolves to Light where the device cannot.
- **SC-007**: Changing one token at the source propagates to all six surfaces with zero per-surface edits, and the mobile-token drift check passes (mobile matches source exactly).
- **SC-008**: 0 occurrences of the retired Jade brand value remain anywhere in the platform.

## Assumptions

- **Interpretation of "multi-color / runtime theme switcher"**: delivered as (a) one richer unified brand palette applied everywhere, plus (b) a user-controllable **appearance switcher** offering Light / Dark / Follow-System. The token architecture is left extensible so additional named color palettes could be added later, but shipping additional palettes beyond light/dark is **out of scope** for this slice — consistent with the platform's "every app MUST have the same theme" requirement and the single palette supplied.
- **Brand replacement confirmed**: forest-green `#26483a` replaces Jade `#0FB57E` as the brand accent everywhere; Jade is retired. This requires amending the governing brand definition (constitution Principle V); that governance change is a prerequisite handled in planning.
- **Dark palette is authored here**: the supplied tokens define the light appearance; the dark appearance values are decided as part of this feature to preserve brand identity and pass contrast.
- **Terracotta role**: `#d0735a` serves as the warm attention/secondary-destructive accent; the mapping of the existing destructive/error role to it is a design decision made during planning.
- **Outfit licensing**: the Outfit typeface is available under an open license permitting embedding on web and in mobile apps.
- **Preference persistence is local per surface**: appearance choice is stored on the device/browser; cross-device account-level theme sync is out of scope this slice.
- **All surfaces in scope, including base-template ones**: driver-mobile currently sits on the base template but MUST consume the shared tokens when built — no per-surface theme exception is created.
- **Single-source pipeline reused**: the platform already generates mobile tokens from the web token source with a drift guard; this feature updates the values and adds appearance selection on top of that existing mechanism rather than introducing a parallel system.

## Dependencies

- **Governing brand definition (constitution Principle V)** must be amended from Jade to the new brand before the change can ship (FR-016).
- **Every built surface** (005 back-office, 007 shop-web, 011 customer-web, 013 customer-mobile, 014 shop-mobile, plus the 015 mobile shell) consumes the shared theme and is touched by this change; driver-mobile inherits it when built.
