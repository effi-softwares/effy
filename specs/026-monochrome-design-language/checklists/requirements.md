# Specification Quality Checklist: Monochrome Design Language & Customer Mobile Rebuild

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-29
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs)
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous
- [X] Success criteria are measurable
- [X] Success criteria are technology-agnostic (no implementation details)
- [X] All acceptance scenarios are defined
- [X] Edge cases are identified
- [X] Scope is clearly bounded
- [X] Dependencies and assumptions identified

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria
- [X] User scenarios cover primary flows
- [X] Feature meets measurable outcomes defined in Success Criteria
- [X] No implementation details leak into specification

## Notes

### Validation iteration 1 — issues found and fixed

1. **Implementation detail leak** — early drafts named the specific colour values, the typeface
   name, the Figma file, and the token file path. All removed from the spec: the spec now says
   "a neutral near-black", "the platform typeface", "the chosen design language", and "the single
   shared source of truth". The concrete values are research/plan material, held in
   `scratchpad/figma/FINDINGS.md` for `/speckit-plan` to consume.
2. **Untestable requirement** — "the app should look elegant" was replaced by SC-008, which is
   judged by a reviewer shown both the source design and the app.
3. **Unbounded scope** — the original request said "completely refactor the customer mobile app",
   which could be read as including architecture. FR-001 and FR-017 bound it to presentation, and
   the Out of Scope section names every surface that receives the identity change only.

### Validation iteration 2 — after full source research (2026-07-29)

The operator supplied full local exports (49 files = **48 screens + 1 banner frame**) and all 9 component sheets, and
re-authenticated Figma. Research is now complete and three spec items changed as a result:

1. **The open semantic-colour assumption is RESOLVED as fact.** The kit's own `Colors` sheet
   declares 12 tokens: ten neutrals plus a success green and an error red. The spec's assumption
   was correct, so the reversal note was removed and **FR-009a** now states the two-semantic-colour
   rule as a requirement. No `/speckit-clarify` round is needed for it.
2. **Three new conflicts surfaced from the component sheets** and became requirements:
   **FR-015a** (the kit's disabled button is white-on-`#CCCCCC` ≈1.6:1 and fails the AA floor — the
   floor wins), **FR-030a** (the kit offers Facebook sign-in, which is not an Effy credential route),
   and **FR-031a** (the kit's 5-tab navigation differs from the app's 4-tab shell — a navigation
   change, not a restyle, so it must be decided explicitly).
3. **Four edge cases were added** covering contrast-failing source pairings, ambiguous
   letter-spacing/line-height units, unsupported credential routes, and the navigation mismatch.
   The edge case about distinguishing destructive actions "in a palette with no destructive colour"
   was removed — the palette has one.

The full research is recorded in [figma-source-findings.md](../figma-source-findings.md).

### Validation iteration 3 — `/speckit-analyze` remediation (2026-07-29)

A cross-artifact analysis found 22 issues (1 critical, 5 high). All critical and high items are fixed;
the two most serious were verified against the repo before acting:

1. **CRITICAL — the guard was never going to run.** FR-011 says the retired-palette guard MUST fail the
   build. Verified: **`check-no-jade.sh` is referenced by nothing** — no package script, no Makefile
   target, no CI step — and has been in that state since 017. The root `pnpm test` is `turbo run test`,
   which only runs per-package scripts, so the original T027 wording ("wire it into the root
   `pnpm test`") would not have executed in CI either. Fixed by **T027a** (explicit CI step for both
   guards + a `guards` Makefile target) and **T027b** (prove it by making CI fail). This is exactly the
   failure R13 was written to prevent, hiding inside the task that was supposed to prevent it.
2. **HIGH — driver-mobile had no typography target.** FR-012 requires the typeface on all six surfaces;
   verified that `gen-compose-theme.mjs` sets `typographyOut: null` for driver and `compose-driver/`
   has no `EffyTypography.kt`. T026 would have copied fonts into a directory nothing consumes. Fixed by
   **T025a**.
3. **HIGH — FR-004 was self-contradicting.** The adapted disabled pair and the placeholder grey had no
   tokens, so T046 would have hardcoded the values FR-004 forbids. Fixed by **T014a** plus new
   `--disabled`, `--disabled-foreground`, `--placeholder` tokens in data-model §2.
4. **HIGH — SC-016 (SSR shell + SEO) had no task**, despite the font swap being exactly the change that
   can alter the prerendered shell. `pnpm e2e` added to T028 and T086.
5. **HIGH — the screen partition did not add up.** Recounted from the export directory: **48 screens**,
   not 49 (`Group 16.jpg` is a banner). Corrected partition: 33 restyled · 9 → 6 new · 6 excluded, with
   the 2 invented screens and 2 excluded *affordances* tracked separately because they are not source
   screens. T043 now drives off a machine-readable list.
6. **Two arithmetic errors of mine**, both corrected: R10 claimed the disabled pair measures 3.9:1 — it
   is **3.16:1**; and `RETIRED_EMERALD` was listed with 5 values in research but 10 everywhere else,
   omitting both terracotta appearances, the dark ring, and both splash grounds.

A third source value also had to be tuned, found while pinning tokens: the kit's `#999999` placeholder
measures **2.85:1** on white and fails the 3:1 floor → adopted as `#808080`.

Also added: **FR-030b + SC-020** (touch targets — a Principle V MUST that had no requirement) and
**SC-021** (mark distinguishability, which FR-022 asserted but no criterion measured).

### Genuinely still open — for implementation

- **FR-022 — how do customer and shop stay distinguishable without a hue?** 024 separated their app
  icons by colourway (emerald vs sky). Remove hue and both get the same mark, so two Effy apps on one
  home screen become indistinguishable. This is an unsolved design problem, not a formality.
- **FR-031a — the navigation decision.** Adopting the kit's IA promotes Cart and Saved into the tab
  bar and displaces Orders.
- **FR-008 / SC-018 — licence confirmation** for both the Community kit and the General Sans typeface.
- **FR-014 — the dark-appearance derivation method**, since the source is light-only.
- The display letter-spacing unit ambiguity (`-5` px or percent) and the H1 line height of 0.8, both
  of which need measuring against rendered text before being committed to tokens.
