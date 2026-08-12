# Sign-off — 044 Customer Storefront Authentication Redesign

**Date**: 2026-08-11 · **Status**: 🚧 **BUILT and machine-verified. Not committed. Not walked live by
a person.** 72/107 tasks complete, 8 dropped by operator direction, 27 open.

---

## What was built

All five user stories are implemented across the storefront's authentication journey.

**US1 — the one-time-code control.** Rebuilt in `packages/design-system/src/ui/otp-input.tsx`. Six
character positions are now real boxes with a visible boundary and fill, laid out in one grid with
the digits so no font metric can slide them apart; the active position carries a ring and a caret; a
refusal paints the cells themselves. It is still **one input** — the cell layer is `aria-hidden`
scenery. The `plain` variant, which the two internal consoles take, is untouched.

**US2 — validation.** The email rule was extracted from the newsletter Lambda into
`@effy/shared-types` and is now consumed by both, so the client refuses exactly what the server
refuses. Every field validates on blur-after-input and on submit, messages appear beside the field in
the platform's treatment, focus moves to the first problem, and **nothing is dispatched until it
passes**. Committing actions became `aria-disabled` and focusable, so pressing one says what is
missing instead of doing nothing.

**US3 — look and layout.** The screens compose the storefront's own field, button, heading and
spacing definitions instead of five local copies. Full-height column with a sticky action group on a
phone; a two-part composition with a typographic brand panel at `lg`. Surface moved to `bg-background`
so the composed field has a real ground.

**US4 — the interruption reason.** `?reason=password-changed` has been produced since 012 and read by
nothing. It is now read, through a closed vocabulary that never echoes the value.

**US5 — the name step.** A subordinate "I'll do this later" that lands the shopper in the shop signed
in, with the cart and saved-list merges still running.

---

## Defects found and fixed beyond the original register

| | What |
|---|---|
| **D-01a** | The code field rendered at **~14px on desktop**, half its intended size. `md:text-sm` in the base class and `text-3xl` in the variant are not conflicting utilities to `tailwind-merge`, so both survived and `md:` won above 768px. Invisible to code reading; found by measuring rendered geometry. |
| **D-22** | **Password reset had no resend cooldown at all.** Sign-in and sign-up mark each send; reset never did. Its code step showed no countdown and offered "Send another code" repeatedly against a budget of five sends per address per hour, after which the platform silently refuses while still showing a normal code screen. The e2e asserting that countdown has existed since 035 and reaches the code step through that exact route — it had never run. |
| **D-11, corrected** | The reported "can go forward without typing any" was **half right, and not where it was thought to be**. Empty submissions are blocked by the browser on the first step of each journey. They are **not** blocked on the password steps, where the email field is `readOnly` and therefore exempt from constraint validation — so an empty address reached `signInWithPassword("")` and came back as *"Something went wrong."* Fixed by refusing the move to a credential step without a usable address. |
| **D-21, withdrawn** | Measured at three viewport sizes including a keyboard-reduced one: the committing action was in view without scrolling in every case. Recorded as **not reproduced**; FR-027's justification changed from "fixes an observed failure" to "robustness on real devices". |
| **Own defect** | The unavailable action's dashed border first shipped using `--border` (`#e5e5e5`, **1.24:1** on white) — the same near-invisible token that made the code field disappear. Caught by looking at a screenshot, not by a test. |
| **Own defect** | The first version of `check()` validated every field in the value object, so the email step refused to advance because the *password* was empty. That would have broken the platform's default way in. Caught by the e2e. |

---

## Amendments made to the spec during implementation

Both were cases of the spec asserting something that was not true of the surface. Each was fixed at
the spec (Principle I), not patched around.

1. **⚠ The storefront has no dark mode.** FR-029, SC-006, SC-007 and one acceptance scenario all
   demanded a dark-appearance walk. `customer-web` is **light-only by a recorded operator decision** —
   it ships no appearance switcher, never applies the design system's dark class, and pins
   `color-scheme: light`. The obligation was untestable by construction and a sign-off claiming it had
   been met would have been false. What replaces it: every colour must still come from a token, so the
   shared control resolves correctly for the two consoles, which do have a dark appearance.
2. **The bundle gate measures nine routes, not ten.** Corrected in the plan, quickstart and contract.

---

## Operator-directed changes after the first build (2026-08-11)

All reviewed on screenshots of a production build. Three reverse an earlier decision of this slice or
a documented requirement, and are recorded as decisions rather than left to look like drift.

| Change | Note |
|---|---|
| Committing action is a **normal primary button** in every state | ⚠ Reverses FR-019's "distinguishable when unavailable". The dashed-outline treatment made the primary action of every step look provisional. **FR-020 becomes load-bearing as a result**: the only thing now preventing D-04's "I press it and nothing happens" is that pressing it always responds, so every `blocked` site must pass `onBlocked` — verified, all four do. |
| **Spam-folder note and support address removed** from the code step | ⚠ Withdraws 037's FR-030a. That escape hatch was uniform and unconditional *because* the platform cannot say "we can't reach that address" without leaking whether an account exists. A shopper whose code never arrives now has no route to a human from that screen. `enumeration.test.ts` still asserts it and now fails — the assertion is not wrong, the requirement behind it was withdrawn. |
| Code cells: **page-coloured fill, larger radius (`rounded-xl`), 1.5px stroke** | The stroke *weight* was lightened, not the colour: `--ring` is 3.95:1 and the WCAG 1.4.11 floor is 3:1, so there is ~no colour headroom. Going visibly lighter (≈`#b3b3b3`, 2.1:1) would recreate D-01. |
| **Header and brand mark removed** from all auth pages | ⚠ It was the only link out of this route group. A guest sent here from checkout could press it to decline and keep browsing — 011's FR-021, with an e2e asserting that click. The browser back button is now the only way out of the FIRST step of each journey. |
| Text actions **semibold, full-contrast, underlined**; body copy `font-medium` | "Use a password instead", "Email me a code instead", "Forgot your password?", the footers, Back and the password reveal. One shared `inlineActionClass` so the treatments cannot drift. The name step's skip stays subordinate (`tone="subtle"`) per FR-035. |
| **Desktop brand panel**: flat abstract pattern in 039's recorded colours | Four passes: radial blobs → stronger → full-coverage linear sweep → **flat geometry, no gradients at all**. The colours are `#F95F09` / `#374128` / `#6BB252`, reusing 039's FR-005a exception rather than opening a second one; component-local constants, never tokens — `tokens:check` passes unchanged. |
| **Anchoring became opt-in** (`StepShell`'s `anchor`) | The layout stretched *every* step to full height so a bottom action could reach the foot of a phone. On steps whose `bottom` is only the "Join" footer that left the form at the top of the screen with a few hundred pixels of nothing beneath it. Now centred at every width unless the step has a committing action. |
| Code label→field gap **8px → 16px** | Switched from `space-y` to explicit margins: the label gap and the message gap are doing different jobs and one value could not be right for both. |

---

## Verified (machine)

- `pnpm -r typecheck` — **14/14 packages**
- `pnpm build` — clean
- `pnpm size` — **9/9 routes within budget**, and **smaller than baseline on every route**:
  `/` 173.0 → 172.8 · `/search` **173.9 → 173.6** (this route had 0.1 KB of headroom) ·
  `/product/[id]` 170.7 → 170.4 · `/cart` 172.4 → 172.2
- `check-tokens.mjs` — 36 vars × 2 appearances, all pairs pass WCAG AA
- `tokens:check` — 8 generated Compose files match; **no token added by this slice**
- `check-no-emerald` / `check-no-jade` — clean
- `turbo build` for `shop-web` + `back-office` — both build
- Rendered geometry measured at 375 / 768 / 1440 across nine states. ⚠ The screenshots those
  measurements came from were **not committed** — `specs/` is text-only in this repository, and the
  numbers in [BASELINE.md](BASELINE.md) are the durable record. Re-capturing any of them is one
  Playwright run against a production build.

## ⚠ Pre-existing failures, NOT caused by this slice

- **`make storefront-locks` FAILS.** `StorefrontFooter.tsx`, `PrimaryNav.tsx` and `MobileNav.tsx` are
  reported as drifted. **All three are unmodified in this working tree** (`git status` is empty for
  that directory); the lock baseline was never updated after commit `1808ee8` (the `/browse` →
  `/search` refactor). Updating the baseline here would hide someone else's undeclared change, so it
  was left failing and recorded instead.
- **~38 storefront e2e failures** in `delivery`, `cart`, `home`, `ssr-seo`, `refinement`, `guest` and
  `a11y`. These need a running `core-api` with a seeded catalogue, which was not available; several
  also hardcode `localhost:3000` while the verification server ran on 3100. 039 already recorded three
  of these specs as stale since 025. **Not investigated further** per operator direction.

---

## ⚠ Open

**Operator direction (2026-08-11): no unit test files.** The three authored in this slice were
deleted; pre-existing repository tests were left in place, including the two that are the only
mechanical proof the consoles' sign-in was not broken. The cost is recorded at the head of
[tasks.md](tasks.md): three requirements that had unit coverage now rely on end-to-end specs that are
run by hand and are not part of `pnpm test`.

Still open, all requiring a person:

- **The live journeys** — sign in with a real code, register and skip the name step, reset a password
  and see the explanation, and confirm a password manager still fills *and saves*.
- **The observational criteria** — SC-001 (five people find the code field unprompted), SC-002 (none
  calls the unavailable action pressable), SC-016 (three observers judge it the same shop as the
  storefront home), SC-009 (screen-reader pass), SC-008 (measure every touch target).
- **The colour-removed walk** (SC-010) — this matters more on a light-only monochrome surface than it
  would elsewhere: there is no second appearance to disambiguate a state and no hue to spend.
- **The defect-register walk** (SC-017) and **the commit**.
- **Carry-forwards**: the newsletter form still uses browser validation (its rule is now shared, so
  the fix is small); Google remains parked; PostHog is still not initialised on `customer-web`, so
  this slice's three declared events will not fire — which is why no success criterion here is
  measured through telemetry; `customer-mobile` runs the same journeys and is untouched.
