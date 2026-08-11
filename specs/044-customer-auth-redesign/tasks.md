---

description: "Task list for 044 — Customer Storefront Authentication Redesign"
---

# Tasks: Customer Storefront Authentication — Visual Redesign & Input Repair

**Input**: Design documents from `/specs/044-customer-auth-redesign/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED. Two of this slice's success criteria are *proved by tests that must pass
unmodified* (SC-011, and the newsletter extraction), one is proved by a test that must be written
(SC-004), and 039's post-mortem is explicit that layout, contrast and hierarchy are not properties a
DOM assertion can see — so the observational walks are tasks too, not a closing formality.

**Organization**: grouped by user story. Each story is independently implementable and independently
testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1…US5 from [spec.md](spec.md)

## Path Conventions

Monorepo. Paths are repository-relative from `/Users/janith/Projects/effy/`.

- Storefront: `apps/customer-web/`
- Shared UI: `packages/design-system/`
- Shared contracts: `packages/shared-types/`
- Console proof: `packages/web-kit/`
- The one backend file: `apis/edge-api/customer/src/newsletter/service.ts`

---

## Phase 1: Baseline (BLOCKING — nothing is edited in this phase)

**Purpose**: two entries in the defect register could not be confirmed by reading the code. They are
observed against a running build **before** anything changes, and the result is written down whether
or not it reproduces. A fix for a defect nobody has seen is a change with no evidence behind it.

**⚠️ No source file is modified in Phase 1.** The only file written is `BASELINE.md`.

- [X] T001 Start the storefront (`cd apps/customer-web && pnpm dev`) with browser devtools open and the **console visible** — one of the things being looked for is a message the browser logs but never shows the customer
- [X] T002 Create `specs/044-customer-auth-redesign/BASELINE.md` with the ten-case table from [quickstart.md](quickstart.md) §1a (5 entry points × {empty, `person@example`})
- [X] T003 Observe **D-11 case 1/5** — `/sign-in` email step: submit empty, then submit `person@example`. Record: did the step advance · what was shown and where · what was logged · did a network request leave the page
- [X] T004 Observe **D-11 case 2/5** — `/sign-in` → "Use a password instead" → password step. Same two submissions, same four observations. Watch specifically for `An invalid form control … is not focusable` — that is a *silent* block and looks identical to "nothing happened"
- [X] T005 Observe **D-11 case 3/5** — `/sign-up` email step. Same two submissions, same four observations
- [X] T006 Observe **D-11 case 4/5** — `/sign-up` → "Set a password instead" → password step. Same two submissions, same four observations
- [X] T007 Observe **D-11 case 5/5** — `/reset-password` email step (⚠ its action renders **outside** the form it submits, via `form=`). Same two submissions, same four observations
- [X] T008 Write the D-11 verdict into `BASELINE.md`: **confirmed**, **not reproduced**, or **partially reproduced**, with what was actually seen. Do not adjust the spec's register to match a convenient answer — amend it to match the observation (Principle I)
- [X] T009 Observe **D-21** on a real phone or a device-mode viewport: on `/sign-in` and on the code step, focus a field, let the software keyboard open, and record whether the committing action is still visible and reachable. Repeat in landscape on a short screen. Record in `BASELINE.md`
- [X] T010 Record the starting bundle: `cd apps/customer-web && pnpm build && pnpm size`. Paste the full nine-route table into `BASELINE.md` — every later bundle claim is a delta against this, not against a remembered number
- [X] T011 Record the starting gate counts in `BASELINE.md`: the package count reported by `pnpm -r typecheck` and by `pnpm -r test`, separately. ⚠ 029 shipped with a green test run and a **failing** typecheck; the only signal was a count falling by one
- [X] T012 [P] Capture "before" screenshots of the reachable screens at 375 and 1440 px and MEASURE the rendered geometry from them (field position, width, derived type size). ⚠ The measurements go into `BASELINE.md`; the images are **not committed** — `specs/` is text-only in this repository, and a number is a better record of a layout defect than a picture of one

**Checkpoint**: `BASELINE.md` committed. The register's two unverified items are now either facts or
withdrawn, and every later measurement has something to be measured against.

---

## Phase 2: Foundational (BLOCKING prerequisites for US1, US2, US3, US5)

**Purpose**: the shared email rule, and the auth screens' primitives. US2 cannot show an inline error
until the field primitive has an error slot; US1 and US2 both need the action primitive to stop being
`disabled`. These block more than one story, so they come first.

**⚠️ CRITICAL**: no user-story phase begins until Phase 2 is complete and T027 is green.

### The shared email rule (Principle II — research R2)

- [X] T013 [P] Create `packages/shared-types/src/validation.ts` exporting `EMAIL_MAX_LENGTH = 254`, `EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/` and `isEmailShape(value: string): boolean` (trimmed, non-empty, within the length ceiling, matching the shape). ⚠ These are the values **already enforced** by `apis/edge-api/customer/src/newsletter/service.ts` — this is an extraction, not a redefinition (contract V-02)
- [X] T014 [P] Create `packages/shared-types/src/validation.test.ts` covering the full worked-cases table in [`contracts/auth-validation.contract.md`](contracts/auth-validation.contract.md) §1 — including the two that matter most: `person@example` is **refused** (SC-004), and a well-formed address with no account is **accepted** (FR-044, no enumeration)
- [X] T015 Export `./validation` from `packages/shared-types/src/index.ts`
- [X] T016 Run `pnpm --filter @effy/shared-types run contract:check` — ⚠ this package generates a Kotlin contract from its sources; confirm `contract/Dto.kt` and `contract/schema.json` show **no drift**. A validation constant must not leak into the mobile contract
- [X] T017 Edit `apis/edge-api/customer/src/newsletter/service.ts` to import `EMAIL_SHAPE` / `EMAIL_MAX_LENGTH` from `@effy/shared-types` and delete the local declarations. Change nothing else
- [X] T018 Run `pnpm --filter @effy/edge-customer test` — **its tests must pass UNMODIFIED**. That is the proof the extraction changed no behaviour (contract V-03). If a test needs editing, the extraction is wrong

### The auth primitives (research R4, R5, R6)

- [X] T019 Edit `apps/customer-web/app/(auth)/_components/AuthKit.tsx` — replace the local `Field` with a composition over `components/storefront/kit.tsx`'s `Field` (which already carries an **error slot**, the thing the local copy lacks) plus its `input` class. ⚠ The kit field's ground is `bg-card`; T044 moves the auth surface to `bg-background` so the two are not the same colour
- [X] T020 Edit `AuthKit.tsx` — rebuild `PasswordField` on the same composed field, keeping the reveal toggle at 44px with its `aria-pressed` and its field-naming label. ⚠ Do **not** reintroduce a "confirm password" field (012 FR-023 / 036 FR-030)
- [X] T021 Edit `AuthKit.tsx` — `Submit` becomes **`aria-disabled` and focusable**, never the native `disabled` attribute (research R4, contract V-15…V-17). Unavailable state is carried by a distinct treatment, **not** by opacity alone (FR-019, defect D-04). Activating it while unavailable must run the caller's validation and surface what is missing (FR-020)
- [X] T022 Edit `AuthKit.tsx` — `Submit` gains in-flight indication beyond a text swap, and cannot be activated twice while in flight (FR-021, defect D-07)
- [X] T023 Edit `AuthKit.tsx` — `ErrorNote` becomes the **single** error region primitive, and a new sibling `InfoNote` is added for non-error notices (needed by US4). Both carry the correct role: `alert` for the error, a polite status for the notice — a completed security action must not announce as a failure
- [X] T024 Edit `AuthKit.tsx` — `StepShell`'s heading composes the kit's `Display` with `normal-case` and responsive sizing rather than hardcoding the merchandising all-caps treatment (FR-024, defect D-18). Follow `SectionHeading`'s precedent, do not add a second heading definition
- [X] T025 Edit `AuthKit.tsx` — `TextAction` keeps its 44px minimum and composes the kit's button class rather than restating one (defect D-17)
- [X] T026 [P] Create `apps/customer-web/app/(auth)/_components/AuthKit.test.tsx` asserting: the action exposes `aria-disabled` and **not** `disabled` when unavailable; it stays in the tab order; activating it while unavailable calls the caller's validation; `ErrorNote` has `role="alert"` and `InfoNote` does not
- [X] T027 Checkpoint: `pnpm -r typecheck` and `pnpm -r test` — package counts match T011

**Checkpoint**: the email rule has one definition and two consumers; the auth primitives can carry an
inline error, an accessible unavailable state and an informational notice. User stories may begin.

---

## Phase 3: User Story 1 — Enter a code on a screen that shows me where to type (P1) 🎯 MVP

**Goal**: the six positions a code goes into are visible, aligned with their own label, individually
indicated, and able to carry an error — while the control stays **one input**.

**Independent test**: on a phone and on a desktop, find the code field without being told where it is,
type six digits and watch each land in its own position, see the action become available at exactly
the sixth, recover from a refusal without retyping, and reach the storefront.

**⚠ This phase touches a control shared with two internal consoles whose emailed code is their ONLY
credential. T036–T038 are not optional and their tests are not edited.**

### The control (research R1, [`contracts/otp-cells.contract.md`](contracts/otp-cells.contract.md))

- [X] T028 [US1] Rebuild the `cells` variant in `packages/design-system/src/ui/otp-input.tsx`: one `<input>` with transparent text and hidden native caret, over an `aria-hidden` `pointer-events-none` layer of `OTP_LENGTH` cells rendering the value. Delete `CELL_GEOMETRY` and every `ch`-unit and `repeating-linear-gradient` remnant (contract C-01…C-03). ⚠ `variant` still **defaults to `"plain"`** — that default is what isolates the consoles
- [X] T029 [US1] In the same file, give each cell a visible boundary **and** a fill distinct from the page ground (C-02, defect D-01). Use existing tokens only — no new token, no new hue (FR-031). ⚠ NOT `--input`/`--border`: the token's own comment says it is "deliberately not contrast-tested", and at 1.24:1 on white it is what made the field invisible. Use a token that clears the 3:1 UI-component bar in both appearances, so the control stays correct for any surface that has a dark one
- [X] T030 [US1] In the same file, fix the centring: the control shares its label's alignment at every width, and **no inline margin may override a centring rule** (C-04, defect D-02 — the inline `marginRight` beating `mx-auto` is what pushes it to the right edge today)
- [X] T031 [US1] In the same file, add the active-position indicator on the cell at `min(value.length, OTP_LENGTH - 1)`, shown **only while the input has focus** (C-05, FR-006)
- [X] T032 [US1] In the same file, wire `aria-invalid` so the **cells themselves** carry the error state, not only the message (C-06, FR-007)
- [X] T033 [US1] In the same file, preserve the long-paste behaviour: no `maxLength` on this variant, the excess stays visible, and the control falls back to the plain rendering as the shape signal (C-11, FR-004). ⚠ This is the defect 035 existed to fix — it must not regress
- [X] T034 [US1] Amend the monospace guard in `packages/design-system/scripts/check-tokens.mjs`: its message claims the **cell geometry** depends on the `ch` advance, which stops being true at T028. Rewrite the message to state what remains true (digits are set in tabular monospace so a code read aloud is unambiguous — C-08). ⚠ **Amend, do not delete.** Deleting a guard because you replaced the mechanism it protected is how the next person reintroduces the bug

### Tests for the control

- [X] T035 [US1] Extend `apps/customer-web/app/(auth)/_components/otp-input.test.tsx` **cells block** with: exactly `OTP_LENGTH` cells render (C-01, from the constant — no literal `6` in the assertion); the single-node invariant still holds (`getAllByLabelText` returns one); digit *i* appears in cell *i*; the active indicator appears on focus and moves with the value; `aria-invalid` marks the cells; an 8-digit value drops to the plain rendering
- [X] T036 [US1] Run `apps/customer-web/app/(auth)/_components/otp-input.test.tsx` **plain block UNMODIFIED** — `maxLength`, `type="text"`, `inputMode`, `autocomplete`, and the default variant. If any needs editing, T028 is wrong (SC-011)
- [X] T037 [US1] Run `pnpm --filter @effy/web-kit test` — `packages/web-kit/src/console/OtpSignInCard.test.tsx` **UNMODIFIED**, including its `maxlength="6"` assertion at line 132 (SC-011)
- [X] T038 [US1] Run `pnpm turbo build --filter=@effy/shop-web --filter=@effy/back-office`, then open both consoles' sign-in screens and confirm the code field renders exactly as before

### The code step

- [X] T039 [US1] Edit `apps/customer-web/app/(auth)/_components/CodeStep.tsx` — accept a parent-supplied message and render it in the step's **single** error region (FR-017, defect D-05). Then remove the second `<ErrorNote>` that `SignInForm`, `SignUpForm` and `ResetPasswordForm` each render **outside** `StepShell`
- [X] T040 [US1] Edit `CodeStep.tsx` — subordinate the three advisory lines (countdown, spam-folder note, support address) so they do not collectively outweigh the field or the action (FR-009/US1 AC-9, defect D-06). ⚠ Keep the uniform escape hatch shown to **everyone, always** — `StuckNote` must not become conditional (037 FR-030a; the invariance test guards it)
- [X] T041 [US1] Edit `CodeStep.tsx` — the label and the field share one alignment and read as a single control (FR-008, defect D-03); the code control is the largest interactive element on the screen (C-07)
- [X] T042 [US1] Extend `apps/customer-web/e2e/otp-entry.spec.ts`: six positions visible; six-digit paste in one action; eight-digit paste not shortened and action unavailable; **nothing auto-submits at the sixth digit** (C-12); a refusal keeps the digits; exactly one alert region on screen
- [X] T043 [US1] Measure: `cd apps/customer-web && pnpm build && pnpm size`. Record the delta against T010 in `BASELINE.md`. ⚠ `app/delete-account/GuestDataControl.tsx` — a **budgeted** route — reaches the `@effy/design-system/ui` barrel, so this file is measured whether or not it renders there. **Do not raise the limit to make it pass** (SC-012)

**Checkpoint**: US1 is independently shippable. A shopper can see where to type, type, and get in;
both consoles are provably untouched.

---

## Phase 4: User Story 2 — Be told about a bad email before a code is sent into the void (P1)

**Goal**: an empty or malformed address is refused, beside the field, in the platform's own error
treatment, **before anything is sent**.

**Independent test**: at every email entry point, an empty submission and a `person@example`
submission are both refused with a visible message beside the field and **no network request leaves
the page**.

- [X] T044 [US2] Create `apps/customer-web/app/(auth)/_lib/validation.ts` — the closed rule vocabulary from [data-model.md](data-model.md) §2 (`required`, `emailShape`, `minLength`), with `required` always evaluated first (V-13), and a hook tracking `touched` / `submitted` per field. ⚠ `error` is **derived from the value, never stored** — storing it is how a corrected field keeps a stale message (FR-013, V-12)
- [X] T045 [US2] In the same file, apply trimming at the validation and submission boundary so a whitespace-only value is **empty**, not malformed (FR-015, defect D-12) — and ⚠ **never trim a password** (V-23)
- [X] T046 [US2] In the same file, add the submit path: validate every field regardless of `touched`, focus the first field with a message in DOM order, announce once (FR-014, V-08)
- [~] T047 **DROPPED (operator direction 2026-08-11 — no unit test files)** — was: [P] [US2] Create `apps/customer-web/app/(auth)/_lib/validation.test.ts` — rule ordering; untouched fields show nothing before the first submit (V-11); blur-after-input validates (V-09); a message clears on correction with no second submit (V-12); whitespace-only is empty; a password's whitespace survives
- [X] T048 [US2] Wire validation into `apps/customer-web/app/(auth)/sign-in/SignInForm.tsx` — email step and password step. ⚠ The email input stays **mounted and `autocomplete="username"`** on the password step so password managers can fill and save (FR-040, V-22)
- [X] T049 [US2] Wire validation into `apps/customer-web/app/(auth)/sign-up/SignUpForm.tsx` — email step and password step, with the password minimum reflected live from `PASSWORD_MIN_LENGTH` (FR-016). ⚠ No strength meter (research R10) and no confirm-password field
- [X] T050 [US2] Wire validation into `apps/customer-web/app/(auth)/reset-password/ResetPasswordForm.tsx` — email step and new-password step. ⚠ Its action renders **outside** the form via `form=`; confirm Enter-from-field and activation behave identically (FR-022, V-18)
- [X] T051 [US2] Wire validation into `apps/customer-web/app/(auth)/_components/NameStep.tsx` — both name fields, trimmed, whitespace-only refused (FR-015). Message must name which field is missing and must **not** imply the account is broken (contract §6)
- [X] T052 [US2] Suppress browser-drawn validation UI on all five forms (`noValidate` on the form element) while **keeping** `type`, `required`, `autocomplete` and `minLength` attributes for autofill and semantics (V-06). ⚠ Removing the attributes would break password-manager pairing
- [X] T053 [US2] Update the tests and e2e specs that assert the `disabled` attribute on `submit-otp`, `submit-name` and `submit-reset` to assert `aria-disabled`. ⚠ This is the **intended contract change** named in research R4 — record it as such in the commit message, so it cannot be mistaken for a test loosened to make a change pass
- [X] T054 [P] [US2] Create `apps/customer-web/e2e/auth-validation.spec.ts` — for each of the five entry points: empty submission refused with a visible message and **zero network requests**; `person@example` refused likewise (SC-003, SC-004, V-14); message clears on correction; focus lands on the first problem
- [~] T055 **DROPPED (operator direction 2026-08-11 — no unit test files)** — was: [US2] Run `apps/customer-web/app/(auth)/_components/enumeration.test.ts` **UNMODIFIED** — validation refuses *malformed*, never *unknown* (FR-044, V-20)
- [X] T056 [US2] Checkpoint: `pnpm -r typecheck`, `pnpm -r test`, `cd apps/customer-web && pnpm depcruise` (the Amplify quarantine must stay clean)

**Checkpoint**: US2 is independently shippable. No code is ever dispatched to an address the platform
would refuse.

---

## Phase 5: User Story 3 — Screens that look like Effy, on any device (P2)

**Goal**: the authentication screens read as the same shop, from 320px to a wide desktop, in both
appearances.

**Independent test**: walk every screen at four widths and compare side by side
with the storefront home.

- [X] T057 [US3] Edit `apps/customer-web/app/(auth)/layout.tsx` — move the surface from `pageSurface` (`bg-card`) to `bg-background`, so the kit's `bg-card` fields have a real figure/ground separation (research R5)
- [X] T058 [US3] In the same file, replace the `min-h-svh` + `items-center` arrangement with a full-height column over `100svh`/`dvh` on small screens (research R8, defect D-21) — `vh` does not shrink when a software keyboard opens
- [X] T059 [US3] In the same file, add the two-part composition at `lg` and above: form column + brand panel slot (FR-028, research R9). ⚠ **No card layout** — this is a column in a composed page, not a bordered tiling container (Principle V)
- [X] T060 [P] [US3] Create `apps/customer-web/app/(auth)/_components/BrandPanel.tsx` — a **typographic** monochrome panel built from `Display` and the neutral ramp. ⚠ **No photograph and no image dependency**: there is no approved auth artwork, and 039's most instructive defect was a supported empty state indistinguishable from a bug. The panel is a slot the operator can fill later with no layout rework
- [X] T061 [US3] Edit `AuthKit.tsx`'s `StepShell` — the bottom group becomes `sticky` at the foot on small screens with its own ground, so the committing action survives a keyboard and a short landscape screen (FR-027). On `lg` it returns to flow
- [X] T062 [US3] Edit `StepShell` — one dominant alignment per step; supporting text is not aligned against the fields it supports (FR-025, defect D-03)
- [X] T063 [US3] Edit `apps/customer-web/app/(auth)/_components/NameStep.tsx` — stack the two name fields on small screens instead of the unconditional two-column grid (FR-033, defect D-19)
- [X] T064 [P] [US3] Edit the loading placeholders in `apps/customer-web/app/(auth)/sign-in/page.tsx`, `sign-up/page.tsx` and `reset-password/page.tsx` so each approximates the shape of the form it stands in for (FR-032, defect D-16)
- [ ] T065 [US3] Walk **320 / 375 / 768 / 1440 px** across every screen: no clipping, no horizontal scroll, action reachable without scrolling past the fields **with the keyboard open**, heading sized for the width, form composed at `lg` (SC-006). ⚠ **The storefront is LIGHT-ONLY by operator decision** (root layout + `globals.css` pin `color-scheme: light`); there is no dark appearance on this surface to walk — see the FR-029 amendment
- [ ] T066 [US3] Run `node packages/design-system/scripts/check-tokens.mjs` — AA contrast across the token set, including the states this slice introduces (SC-007). ⚠ The rule has **zero exemptions** on this platform
- [ ] T067 [US3] Walk every screen with **colour emulated away** (Achromatopsia): available vs unavailable action, error vs hint, active cell vs empty cell all still readable (SC-010, FR-019)
- [ ] T068 [US3] Walk the code screen under `forced-colors: active` (C-16) and at **200% browser zoom** and text-only zoom (C-17) — the cells must still line up with their digits
- [ ] T069 [US3] Measure every interactive target on every screen against the 44px minimum (SC-008). ⚠ **Measure; do not assume.** 033 shipped a 32px target directly under a comment claiming it cleared the minimum
- [ ] T070 [US3] Extend `apps/customer-web/e2e/a11y.spec.ts` with the authentication screens. ⚠ Two tests in this file reference a removed delivery control and have been failing since before this slice (recorded under 039) — do **not** silently absorb them into this slice's result; note them as pre-existing
- [X] T071 [US3] Run `pnpm --filter @effy/design-system run tokens:check` — the Compose theme drift guard must report **unchanged**. This slice adds no token, so any movement here is a defect
- [X] T072 [US3] Run `./scripts/check-no-emerald.sh && ./scripts/check-no-jade.sh && make storefront-locks`
- [X] T073 [US3] Read the diff for SC-015: no screen declares its own copy of a control, field, heading or spacing definition that `components/storefront/kit.tsx` already defines (defect D-17)
- [X] T074 [US3] Re-measure the bundle (`pnpm build && pnpm size`) and record the delta against T010

**Checkpoint**: US3 is independently shippable and the screens are visually coherent with the
storefront.

---

## Phase 6: User Story 4 — Know why I am being asked to sign in again (P3)

**Goal**: a completed password change stops presenting as an unexplained logout.

**Independent test**: complete a password reset and observe the explanation on the sign-in screen.

- [X] T075 [P] [US4] Create `apps/customer-web/app/(auth)/_components/ReasonNotice.tsx` — maps a **closed vocabulary** to a message and renders `InfoNote`. Today the vocabulary has exactly one member, `password-changed` (FR-034). ⚠ **The value arrives in a URL and is attacker-controlled**: it selects from a fixed map and is **never echoed into the page**. Echoing it would let anyone place arbitrary text on the one screen where a shopper is about to type a credential — the same discipline `safeNextTarget` already applies to `next`
- [X] T076 [US4] Render `ReasonNotice` in `apps/customer-web/app/(auth)/sign-in/SignInForm.tsx` from the `reason` search parameter, presented as **information, not an error** (FR-034)
- [~] T077 **DROPPED (operator direction 2026-08-11 — no unit test files)** — was: [P] [US4] Create `apps/customer-web/app/(auth)/_components/ReasonNotice.test.tsx` — `password-changed` renders the message; an **unknown**, empty, or markup-bearing value renders **nothing**; the notice does not carry `role="alert"`
- [X] T078 [US4] Verify both producers still reach it: `app/(account)/account/actions.ts` (the signed-in password change) and `reset-password/ResetPasswordForm.tsx` both navigate to `/sign-in?reason=password-changed`, and that parameter now has a reader (defect D-14)

**Checkpoint**: US4 is independently shippable.

---

## Phase 7: User Story 5 — Finish, or come back to it, without being trapped (P3)

**Goal**: the name step stops being the only dead end in registration.

**Independent test**: reach the name step, decline it, and land in the shop signed in; return later and
be asked again with nothing suggesting the account is broken.

- [X] T079 [US5] Edit `apps/customer-web/app/(auth)/_components/NameStep.tsx` — add a clearly-labelled way to continue without answering, **visually subordinate** to finishing (FR-035, defect D-15). It calls the same `onDone` the finish path calls, so the cart and saved-list merges still run and the shopper lands in the shop signed in
- [X] T080 [US5] In the same file, confirm nothing in the skip path implies the account is incomplete or broken — the account already exists by the time this step renders (036 FR-034/FR-035a)
- [~] T081 **DROPPED (operator direction 2026-08-11 — no unit test files)** — was: [P] [US5] Create `apps/customer-web/app/(auth)/_components/NameStep.test.tsx` — the skip control exists and is subordinate; skipping calls `onDone` and writes **no** profile; a returning shopper's existing name is prefilled rather than blanked; names are trimmed on save (US5 AC-4)

**Checkpoint**: all five user stories are complete.

---

## ⚠ Operator direction, 2026-08-11 — unit tests are out of scope

Mid-implementation the operator directed: *"if test files fails let's just ignore them and continue
the development. im do not want any unit test files."*

**What was done**: the three unit test files authored in this slice were deleted
(`packages/shared-types/src/validation.test.ts`,
`app/(auth)/_components/AuthKit.test.tsx`, `app/(auth)/_lib/validation.test.ts`). No further unit
tests were written, and failing suites are no longer chased. Tasks marked `[~]` below were dropped
for this reason and are listed rather than silently removed.

**What was NOT done, deliberately**: pre-existing repository tests were left in place. Deleting them
was not asked for, and two of them are load-bearing for audiences outside this slice —
`packages/web-kit/src/console/OtpSignInCard.test.tsx` and the plain-variant block of
`otp-input.test.tsx` are the only mechanical proof that `shop-web` and `back-office` sign-in was not
broken by the shared control's rebuild. Their emailed code is the **only** credential either audience
has.

**The cost, stated plainly**: three requirements that had unit coverage now have none — the email
rule's worked-cases table (including the `person@example` case that is this slice's SC-004), the
unavailable-action contract, and the validation rule ordering. They remain covered by the two
end-to-end specs, which run against a production build and were what actually found the defects in
this slice; but e2e is run by hand in this repository and is not part of `pnpm test`, so a regression
in any of the three would now be silent until someone looked.

---

## Phase 8: Polish, Verification & Sign-off

**Purpose**: the gates, the walks a green suite cannot replace, and the honest record.

### Telemetry (Principle VII, research R13)

- [X] T082 [P] Declare the three product events in the storefront's typed taxonomy — `auth_validation_failed` (`flow`, `field`, `rule`), `auth_name_step_skipped` (`route`), `auth_reason_shown` (`reason`) — and emit them from T044/T079/T076. ⚠ **No PII beyond the auth subject id**: the event carries the *field* and the *rule*, never the value the customer typed
- [ ] T083 Record in the sign-off that **PostHog is still not initialised on `customer-web`** (eleventh consecutive slice), so these events will not fire — and that this is acceptable **only** because no success criterion in this slice is measured through telemetry

### The full gate sweep

- [~] T084 **DROPPED (operator direction 2026-08-11 — no unit test files)** — was: `pnpm -r typecheck` — and **count the reporting packages** against T011
- [~] T085 **DROPPED (operator direction 2026-08-11 — no unit test files)** — was: `pnpm -r test` — and count the reporting packages against T011. ⚠ `pnpm -r test` does **not** run `tsc`; both are required (029)
- [ ] T086 `cd apps/customer-web && pnpm depcruise && pnpm build && pnpm size && pnpm e2e`
- [ ] T087 `pnpm turbo build` across all three web surfaces
- [~] T088 **DROPPED (operator direction 2026-08-11 — no unit test files)** — was: Re-run the console lock one final time: `pnpm --filter @effy/web-kit test` and the plain block of `otp-input.test.tsx`, both **unmodified** (SC-011)
- [~] T089 **DROPPED (operator direction 2026-08-11 — no unit test files)** — was: Re-run `pnpm --filter @effy/edge-customer test` **unmodified** (contract V-03) and `pnpm --filter @effy/shared-types run contract:check`

### The live journeys ([quickstart.md](quickstart.md) §6)

- [ ] T090 Sign in with a code, end to end, against the dev pools with a real inbox
- [ ] T091 Recover from a one-digit typo without retyping the other five and without spending an extra attempt (SC-005)
- [ ] T092 Wait out the countdown and resend; then paste an eight-digit code and confirm it is not shortened
- [ ] T093 Press the committing action with four digits entered and confirm it **says what is missing** rather than doing nothing (FR-020, V-17)
- [ ] T094 Register by code, reach the name step, take the **skip** route, and land in the shop signed in with nothing suggesting the account is broken (SC-014)
- [ ] T095 Register again and finish the name step normally
- [ ] T096 Reset a password end to end and confirm the sign-in screen **says the password was changed** (SC-013). Then hand-edit the URL to `?reason=<invented>` and confirm **nothing renders**
- [ ] T097 Sign in with a password and confirm a password manager still fills **and still offers to save** (FR-040)
- [ ] T098 Confirm `person@example` is refused before anything is sent (SC-004)

### The walks no test replaces ([quickstart.md](quickstart.md) §7)

039's post-mortem is the reason these are tasks: four defects shipped there with a fully green suite,
because layout, contrast and hierarchy are not properties a DOM assertion can see.

- [ ] T099 **SC-001** — five people, on a phone, unprompted: all identify where the code is typed within three seconds without asking
- [ ] T100 **SC-002** — none of those five describes the unavailable action as "pressable"
- [ ] T101 **SC-016** — three observers, shown the auth screens beside the storefront home, judge them to be the same shop. Use the T012 "before" shots for the comparison
- [ ] T102 **SC-009** — a screen-reader pass through sign-in by code: each step announced **once**, the code field announced as **one** field, each refusal announced **once**, and nothing stealing focus while a field is being typed in

### The record

- [ ] T103 **SC-017** — walk the register D-01…D-21 in [spec.md](spec.md) and mark each **fixed and demonstrated** or **explicitly out of scope with a reason**. Nothing is left implicitly handled
- [ ] T104 [P] Update [`docs/audiences/customer-capabilities.md`](../../docs/audiences/customer-capabilities.md) with a §044 entry, recording that `customer-mobile` runs the same journeys and is **untouched** — a parity gap stated, not hidden
- [ ] T105 [P] Record the carry-forwards in the sign-off: the newsletter form still uses browser validation (its rule is now shared, so the fix is small); Google remains parked; PostHog initialisation; the pre-existing stale storefront e2e specs and the two `a11y` tests from 039 — ⚠ **named so they are not mistaken for this slice's gaps**
- [ ] T106 Write `specs/044-customer-auth-redesign/SIGNOFF.md`: what was built, what was measured (with the bundle delta from T010), what was walked live, what was **not**, and the D-11/D-21 verdicts from Phase 1
- [ ] T107 Commit — spec, plan, research, data-model, contracts, quickstart, tasks, BASELINE, SIGNOFF and the source changes together (Principle I: no code merges without its artifacts)

---

## Dependencies & Execution Order

### Phase order

```
Phase 1 (Baseline)  ──►  Phase 2 (Foundational)  ──┬──►  Phase 3 (US1, P1) ──┐
                                                    ├──►  Phase 4 (US2, P1) ──┤
                                                    ├──►  Phase 5 (US3, P2) ──┼──►  Phase 8
                                                    ├──►  Phase 6 (US4, P3) ──┤
                                                    └──►  Phase 7 (US5, P3) ──┘
```

- **Phase 1 blocks everything** and modifies no source file.
- **Phase 2 blocks every user story**: US2 cannot render an inline error until the field primitive has
  an error slot (T019); US1 and US2 both need the action primitive off `disabled` (T021).
- **US1 … US5 are independent of each other** once Phase 2 is done and can be built in any order or in
  parallel. Priority order (US1 → US2 → US3 → US4 → US5) is the recommended sequence, not a
  dependency.

### Within-phase dependencies

| Task | Blocked by | Why |
|---|---|---|
| T015 | T013 | cannot export a file that does not exist |
| T017 | T015 | the import target must be exported first |
| T018 | T017 | the proof runs after the extraction |
| T028–T033 | — | all edit one file; do them in sequence, not in parallel |
| T035 | T028–T033 | tests assert the rebuilt control |
| T039 | T023 | needs the single-error-region primitive |
| T048–T051 | T044–T046 | wiring needs the module |
| T053 | T021 | the assertion changes because the primitive changed |
| T057–T059 | — | all edit `layout.tsx`; sequence them |
| T061–T062 | T024 | both edit `StepShell` |
| T065–T069 | T057–T064 | walks run against the finished layout |
| T076 | T075, T023 | needs the component and `InfoNote` |
| T099–T102 | Phases 3–7 | observational walks need the finished screens |

### Parallel opportunities

Marked `[P]` — different files, no incomplete dependency:

- **Phase 1**: T012 runs alongside T003–T009.
- **Phase 2**: T013 and T014 together; T026 alongside T019–T025 once the signatures are settled.
- **Phase 3**: T036, T037 and T038 are three independent proofs and run together.
- **Phase 4**: T047 and T054 alongside the wiring tasks.
- **Phase 5**: T060 and T064 alongside the layout edits.
- **Phase 6/7**: T075/T077 and T081 are independent.
- **Phase 8**: T082, T104 and T105 together.

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (US1).** That is the operator's screenshot fixed: a code screen whose
six positions are visible, aligned, individually indicated, and able to carry an error — with both
internal consoles provably untouched. It is shippable alone and it repairs the screen that terminates
**every** authentication journey on the platform.

### Incremental delivery

1. **US1** — the code screen becomes usable. Ship.
2. **US2** — no code is ever sent to an address the platform would refuse. Ship.
3. **US3** — the screens look like Effy at every width. Ship.
4. **US4 + US5** — two small journey repairs. Ship.

Each increment leaves the storefront in a working state, and each has its own independent test in its
phase header.

### Two rules that apply throughout

- **Do not raise the bundle limit to make `size` pass.** That instruction is written into the gate
  script itself.
- **Do not edit a test to accommodate a change**, except T053, which is a named, intended contract
  change. Everywhere else — and above all in T036/T037/T088 — a failing test means the change is wrong.
