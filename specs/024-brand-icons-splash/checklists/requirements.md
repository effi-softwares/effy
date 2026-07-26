# Specification Quality Checklist: Brand Marks — App Icons, Splash Screens & Favicons

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-26
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — **all resolved** in the 2026-07-26 clarification session
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Validation iterations

**Iteration 1** — three issues found and fixed in the spec:

1. *Implementation detail leaked into requirements.* Early drafts of FR-006/FR-007 named specific
   pixel sizes, the Android adaptive-icon safe-zone measurement in dp, and platform API names. All
   were removed; the requirements now state the outcome ("a mark for every size and variant its
   platform requests", "fully visible under every icon shape the platform may apply") and the size
   tables belong to `plan.md`.
2. *An untestable success criterion.* "The icons look professional" was replaced by SC-002/SC-003,
   which are stated as observer-agreement rates and can actually be run.
3. *Unbounded scope.* The request named three web and two mobile apps, but the repo has a third
   mobile app (driver) still on the template icon. Left implicit, that is exactly the kind of gap that
   gets discovered at sign-off. It is now an explicit negative requirement (FR-020) plus an assumption.

**Iteration 2** — verified no further failures. All Content Quality and Feature Readiness items pass.

### Clarification session — 2026-07-26 (all resolved)

Five questions asked, five answered. Both original markers are closed, and three further decisions
that would otherwise have been improvised during planning were settled at the same time.

| # | Question | Resolution |
|---|----------|------------|
| 1 | The supplied mark is in the **retired Jade** palette that constitution v1.10.0 replaced and `scripts/check-no-jade.sh` rejects. | Recolour into the **Emerald family, legibility-tuned** — bag `#10b981`, fold `#065f46`. Stays inside the authored palette, so **no constitution amendment and no guard exemption**. |
| 2 | How far does the shop blue reach — mark, or the shop UI? | **Mark, splash and favicon only** (FR-014a). No token added, no Compose theme regenerated, shop UI unchanged. Keeps Principle V's single-accent rule intact. |
| 3 | Which blue? | **Blue-500 `#3b82f6` / blue-800 `#1e40af`** — the same two scale steps as the emerald pair, so the marks differ in hue and nothing else. |
| 4 | Supply the platform appearance variants, or let the OS synthesise them? | **Supply all three** — iOS dark, iOS tinted, Android themed (FR-007a). The iOS slots are already declared and empty. |
| 5 | What mark does back-office carry? | A third **Neutral** colourway (FR-016a), reusing the single-colour composition FR-007a already requires. Closes a gap the original US3 scenarios would have passed over: back-office and the storefront would have shared an identical favicon. |

Net effect on scope: **three colourways, not two**, and an appearance-variant matrix on both mobile
apps — but **zero** design-token, Compose-theme or UI changes, which is a tighter blast radius than
the pre-clarification draft implied.

### Notes for the planning phase

Facts established while writing this spec that the plan should not re-derive:

- The real authored vector is **1075 bytes, `viewBox="0 0 500 500"`**, flat named colours
  (`#0C1D36` navy · `#0FB57E`/`#047857` jade · `#F4F5F7` tag). Recolouring is a two-value swap — which
  is why FR-002 (one mark, N colourways) is cheap to honour and worth enforcing.
- Geometry bbox is **~230 × 353 at x 140–370, y 55–408** — content fills ~50% × 75% of the canvas and
  sits **above centre**. Composition per target (FR-007) is real work, not a resize.
- `width="100%" height="100%"` on the root element will need explicit dimensions for deterministic
  rasterisation (SC-009).
- The file the user first pointed at (`apps/customer-web/app/icon0.svg`) is **not a vector** — it is a
  RealFaviconGenerator wrapper around a base64 1000×1000 PNG. It and its siblings are the stale input
  FR-017 replaces, not a foundation.
- **No rasteriser is installed** (no ImageMagick / rsvg / Inkscape); only `sips` and Node 24. The plan
  must choose a toolchain that satisfies SC-009's determinism requirement.
- The existing **`tokens:gen` / `tokens:check`** pair in `@effy/design-system` is the proven in-repo
  precedent for FR-003 and SC-008 (authored source → committed derived artifacts → drift check).
- iOS `AppIcon.appiconset` already declares **dark and tinted appearance slots with no filename** —
  empty placeholders awaiting exactly this feature.
- Pre-existing defect in scope via FR-018: `apps/customer-web/app/layout.tsx` imports **`next/head`**,
  which is inert in the App Router, so its `apple-mobile-web-app-title` never renders. The manifest
  also carries placeholder `#ffffff` theme/background colours.
