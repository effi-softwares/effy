# Research — 044 Customer Storefront Authentication Redesign

**Phase 0 output.** Every decision below is settled; nothing in the Technical Context is left as
NEEDS CLARIFICATION. Items are numbered `R#` and cited from `plan.md`.

---

## R1 — How six visible positions can exist inside one input

**Decision**: keep `OtpInput`'s `variant="cells"` gate and rebuild what that variant renders. The
control becomes **one `<input>` with transparent text and a hidden native caret, sitting on top of an
`aria-hidden` presentation layer of six cells that render the value.**

**Rationale**:

- The single-input requirement is **not negotiable and not this slice's to revisit**. It is carried
  from 035 FR-025 and 036 FR-002, it is asserted by `apps/customer-web/app/(auth)/_components/otp-input.test.tsx`,
  by `packages/web-kit/src/console/OtpSignInCard.test.tsx:121`, and by `e2e/otp-entry.spec.ts`. The
  operator's report of *"no otp fields"* is a report that the positions are **invisible**, which is a
  rendering defect, not an argument for six inputs.
- Today's cells are painted as a `repeating-linear-gradient` **behind text laid out by `letter-spacing`
  in `ch` units**. That makes the geometry depend on the character advance of the running font, which
  is why `packages/design-system/scripts/check-tokens.mjs` carries a guard asserting `--font-mono`
  stays monospace. It is a fragile arrangement that has already produced two visible defects (D-01,
  D-02).
- Putting the digits and the boxes **in the same flex row** removes the dependency entirely: a cell and
  the digit inside it are the same box, so they cannot drift apart under a font change, browser zoom,
  text-only zoom or a different `ch` metric. This is the technique every production OTP field uses.
- It also unlocks three requirements the gradient cannot express at all: a per-cell **active
  indicator** (FR-006), a per-cell **error state** (FR-007), and a per-cell **fill** distinct from the
  page ground (FR-001).

**Mechanics that must hold**:

| Concern | How it is kept working |
|---|---|
| One accessibility node | The real `<input>` is the only labelled, focusable node. The cell layer is `aria-hidden` and `pointer-events-none`. |
| Paste of six digits | Lands on the real input unchanged; the cell layer re-renders from the value. |
| OS message autofill | `autocomplete="one-time-code"` + `inputMode="numeric"` stay on the real input; autofill writes the value, the layer follows. |
| Caret visibility | Native caret hidden (`caret-color: transparent`); the cell at `min(value.length, 5)` carries a visible active ring while the input has focus. |
| Selection | Text selection is invisible under a transparent colour. Accepted: a six-digit field is retyped, not partially selected. Recorded rather than discovered. |
| Forced-colors / high-contrast | Cell borders use a token that resolves through `currentColor` semantics; the layer is checked under `forced-colors: active` (T-see quickstart). |
| Zoom to 200% and text-only zoom | Everything is `rem`/`em`; there are no `ch` units left in the geometry. |

**Alternatives rejected**:

- **Six real inputs (the literal request).** Ruled out by an existing platform requirement, by three
  test files, and by the accessibility reason those exist. Recorded in the spec's Assumptions so the
  divergence is visible rather than quietly taken.
- **`input-otp` / shadcn `InputOTP`.** A new npm dependency in the `@effy/design-system/ui` barrel,
  which `app/delete-account/GuestDataControl.tsx` — a **budgeted guest route** — reaches. The barrel's
  own file header already refuses this dependency for exactly that reason. Nothing it offers is
  unavailable here.
- **Keeping the gradient and just darkening it.** Fixes D-01's symptom, leaves D-02 (the off-centre
  push), the `ch` fragility, and makes FR-006/FR-007 unbuildable.

**Consequence for an existing guard**: `check-tokens.mjs`'s monospace assertion was written to protect
`ch`-unit geometry that will no longer exist. Leaving its message in place would make it **assert a
reason that is no longer true**, which is worse than no guard. It is amended — not deleted — to state
what remains true (the digits are still set in tabular monospace so a read-aloud code is unambiguous),
and a new unit assertion is added that the cell layer renders exactly `OTP_LENGTH` cells.

---

## R2 — The email rule already exists in this platform, in one place, and it is right

**Decision**: promote the existing rule out of the Lambda that owns it into `@effy/shared-types`, and
consume it from both the backend and the authentication screens.

**Rationale**: `apis/edge-api/customer/src/newsletter/service.ts` already declares

```
const MAX_EMAIL_LENGTH = 254
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/
```

That rule refuses exactly the address class FR-010 names — `name@example` fails it, because the
segment before the dot may not itself contain a dot and a dot is mandatory. So the platform already
knows the answer; it just keeps it somewhere the storefront cannot reach. **Copy-pasting it into
`app/(auth)/` would be a Principle II violation on its face** — a cross-cutting rule duplicated per
surface — and it is precisely the shape in which the newsletter copy and the auth copy would later
disagree about what a valid address is.

Promoting it also makes the client rule **identical to the server rule by construction**, which is the
only version of client validation that is honest: the client is refusing what the server would refuse,
not inventing a stricter opinion.

**Scope discipline**: the newsletter service is edited to import rather than declare. Its behaviour is
unchanged and its tests must pass unmodified — that is the proof the extraction changed nothing, the
same proof 028 used when it promoted the S3 presign helper.

**Alternatives rejected**:

- **A stricter RFC-5322-ish regex.** Every well-known "full" email regex either rejects legitimate
  addresses or is unreadable. The platform's job here is to catch the typo class that produces an
  undeliverable code, not to adjudicate RFC conformance — the mail server does that.
- **Leaving validation to the browser** (today's arrangement, and the newsletter's stated position).
  The browser's rule accepts `name@example`, cannot be styled, cannot be announced on our terms, and
  cannot fire on blur. FR-009 through FR-014 are unbuildable on it. The newsletter's own comment
  ("free, translated and accessible") is a fair argument for a low-stakes subscribe box; it is not one
  for the screen where a wrong address produces a shopper stranded on a code that will never arrive.
- **Fixing the newsletter in the same slice.** Out of scope. It is recorded as a follow-up so the
  divergence is known rather than accidental.

---

## R3 — Validation without a form library

**Decision**: a small, local, hand-written validation module for these five forms. No form library.

**Rationale**: the constitution's locked web stack names the TanStack suite, and the two internal
consoles use it. `apps/customer-web` deliberately does not — 019 shipped a dependency-free cart on
`useSyncExternalStore` "by this app's tiny-guest-bundle design", and the same reasoning applies here.
The whole requirement set is: *is this field touched, is its value acceptable, what do we say if not,
and clear it when it becomes acceptable.* That is roughly forty lines. A form library for it would add
a dependency to the app that most carefully refuses them, to solve a problem it does not have.

This is a **recorded deviation from the locked stack**, and it appears in the plan's Complexity
Tracking rather than being taken silently.

**Shape**: one module exposing per-field rules (`required`, `emailShape`, `minLength`) and a hook that
tracks touched/error state per field, validates on blur-after-input and on submit, and clears on
correction. It is imported only by `app/(auth)/`.

---

## R4 — Why the unavailable action must not be `disabled`

**Decision**: committing actions become **`aria-disabled` and focusable**, not `disabled`. Activating
one while it is unavailable runs validation and shows the reason instead of doing nothing.

**Rationale**: FR-019 and FR-020 together are unsatisfiable with a native `disabled` button. A
`disabled` button cannot receive focus, is skipped by keyboard and by many screen-reader element
lists, announces nothing, and — this is D-04 — is styled by a token opacity that on a near-black
monochrome fill renders as an ordinary mid-grey. The shopper presses it, nothing happens, and the
screen has no way to explain why because the control that would explain it is the one that is inert.

`aria-disabled` keeps the control in the tab order and in the accessibility tree, lets it be styled
distinctly rather than merely faded, and lets a press become *the* moment the screen says what is
missing. This is the pattern GOV.UK and the WAI practices both land on for a blocking form action.

**Consequence**: existing tests and e2e specs that assert the `disabled` attribute on
`submit-otp` / `submit-name` / `submit-reset` must be updated to assert `aria-disabled`. That is a
real, deliberate contract change and it is listed as such — not a test loosened to make a change pass.

---

## R5 — The screens must be built from the storefront's own primitives

**Decision**: `app/(auth)/_components/AuthKit.tsx` stops declaring its own field, button, heading and
spacing definitions and composes `components/storefront/kit.tsx` instead.

**Rationale**: D-17. The kit already exports `Field` (with an error slot the auth-local copy lacks —
which is *why* there are no inline errors today), `input`, `btnClass`, `Display`, `sectionSpacing`.
The auth copies differ in padding (`px-3` vs `px-4`), field ground (`bg-background` vs `bg-card`) and
focus treatment (`ring` vs `outline`) — three silent divergences already, on screens that are supposed
to be the same shop. SC-015 makes this checkable.

**One consequence that must be handled, not inherited**: the kit's field ground is `bg-card`, and the
auth surface is currently *also* `bg-card`, so composing naively would put a card-coloured field on a
card-coloured page and leave the border doing all the work. The auth surface therefore moves to
`bg-background`, which restores a real figure/ground separation and is what the composed desktop
layout wants anyway.

**What stays local**: `StepShell` (step chrome is genuinely auth-specific), `TermsNotice`, the Google
control, and the code control's *call site*. Those are not cross-cutting.

---

## R6 — One error region, and the parent stops drawing a second one

**Decision**: the code step owns exactly one error region. `SignInForm`, `SignUpForm` and
`ResetPasswordForm` stop rendering their own `ErrorNote` above it and pass the message down instead.

**Rationale**: D-05. Today a journey-level error renders *outside* `StepShell`, above the back
control, while the step's own error renders inside — two regions, both `role="alert"`, both able to
be true at once, announced twice. FR-017 forbids it.

---

## R7 — The interruption reason, and why it must be a closed vocabulary

**Decision**: the sign-in screen reads a `reason` search parameter and renders an informational notice
for **known values only**. An unknown value renders nothing.

**Rationale**: D-14 is a confirmed dead parameter — `app/(account)/account/actions.ts:156` and
`ResetPasswordForm` both navigate to `/sign-in?reason=password-changed` and nothing reads it, so a
successful password change presents as an unexplained logout.

The security constraint is the interesting half: this value **arrives in a URL and is therefore
attacker-controlled**. Rendering it, or any part of it, would let anyone put arbitrary text on the
platform's sign-in screen — a ready-made phishing surface on the one page where a shopper is about to
type a credential. The parameter therefore selects a message from a fixed map and is never echoed.
The same discipline `safeNextTarget` already applies to `next`.

**Presentation**: informational, not the error treatment (FR-034). A completed security action must
not look like a failure.

---

## R8 — Mobile layout, and the keyboard

**Decision**: a full-height single column with the committing group **`sticky` at the bottom on small
screens**, over `100svh`/`dvh` rather than `100vh`.

**Rationale**: today's `mt-auto` inside a `min-h-svh` column places the action at the foot of the
*column*, which is the foot of the viewport only while the viewport is what the browser first
reported. `vh` units do not shrink when a software keyboard opens; `svh`/`dvh` describe the small and
dynamic viewport and are what the action must be measured against. A sticky footer group additionally
keeps the action visible on a short landscape screen where the column overflows — the case D-21 names
and nobody has observed.

D-21 remains a **baseline observation task** (see R12): the fix is specified, but whether the current
build actually fails is being asserted by nobody until it is looked at.

---

## R9 — Desktop composition

**Decision**: at `lg` and above, a two-part layout — a form column and a **typographic brand panel**
built from the neutral ramp. No photograph.

**Rationale**: FR-028 asks for a composed layout, not for imagery. Three reasons to keep it
typographic:

1. **There is no approved auth artwork.** Inventing one, or borrowing 039's hero, would be a
   real-world asset decision this slice has no mandate for.
2. **039's most instructive defect was an asset that was absent and looked broken** — a placeholder
   that a `public/hero/README.md` had written down as expected behaviour. A layout that requires an
   image it may not have is that defect waiting to recur.
3. Monochrome typography at display scale is the storefront's own established voice (`Display`), so
   the panel reads as Effy without introducing anything.

The panel is a **slot**. If the operator later supplies artwork, it fills the same slot with no layout
rework — the same shape 042 used for its two-stage cutover.

**Card-layout check (Principle V)**: the form column is a **column**, not a card — no bordered or
elevated container tiling content, no metric cards. Nothing here triggers the escape clause, so
nothing needs justifying.

---

## R10 — Password feedback, and what is *not* being built

**Decision**: state the minimum before typing, and reflect *whether it is met* as the customer types.
**No strength meter.**

**Rationale**: FR-016 asks for the requirement to be reflected, and the platform's actual policy is a
12-character minimum with **no composition rules** — so there is exactly one thing to reflect. A
strength meter implies a scoring model; a real one (zxcvbn and friends) is hundreds of kilobytes, and
a fake one is a lie drawn as a progress bar. The honest control is: here is the rule, here is whether
you have met it.

The minimum comes from `PASSWORD_MIN_LENGTH` in `@effy/shared-types`, as it already does — 036 fixed
that drift once and it must not be reintroduced.

---

## R11 — Proving the two consoles were not disturbed

**Decision**: `packages/web-kit/src/console/OtpSignInCard.test.tsx` and the *plain-variant* block of
`apps/customer-web/app/(auth)/_components/otp-input.test.tsx` **must pass unmodified**, and both
consoles must build.

**Rationale**: `OtpInput` is shared. `shop-web` and `back-office` pass no variant, so they take
`"plain"` — the gate is the default parameter, and it is load-bearing: an emailed code is the **only**
credential either audience has, with no password to fall back on. A regression there is a lockout, not
a cosmetic bug. Editing those tests to accommodate a change is therefore forbidden; if they fail, the
change is wrong. This is the same proof shape 028 used for the presign extraction.

---

## R12 — Two register items are unverified, and are being verified first

**Decision**: the first implementation phase is a **baseline observation** against a running build,
recorded in `BASELINE.md` (the artifact 036 used for the same purpose), covering D-11 and D-21.

**Rationale**: D-11 (a step advancing on an empty or malformed email) was reported by the operator and
**could not be confirmed by reading the shipped code**. Reading says the browser's own enforcement
should block it: every email field carries `required`, and the one arrangement that classically
defeats it — a required control inside a hidden container, which the browser cannot focus and
therefore blocks *silently* — does not apply, because on both password steps that hidden field is also
`readOnly`, and a read-only control is barred from constraint validation altogether.

So one of three things is true, and which one it is changes nothing about the fix but everything about
the honesty of the record: (a) there is a path the reading missed, (b) the browser's refusal is
happening but is invisible enough to read as absent, or (c) the observation was of a different screen.
FR-009 replaces the browser's enforcement regardless. **Writing an unverified claim into the record as
a fact is how a spec launders a guess into a requirement**, so it is checked at all five entry points —
sign-in email, sign-in password, sign-up email, sign-up password, reset-password email — and written
down either way.

D-21 is the same discipline applied to a layout claim nobody has observed.

---

## R13 — Telemetry (Principle VII), stated plainly

**Decision**: this slice declares its product events and **fixes none of the platform's telemetry
gap**, and it deliberately sets **no success criterion that depends on telemetry**.

**Events introduced**: `auth_validation_failed` (props: `flow`, `field`, `rule`),
`auth_name_step_skipped` (props: `route`), `auth_reason_shown` (props: `reason`). They join the
existing `auth_code_*` / `sign_in_completed` taxonomy.

**The gap, stated rather than implied**: PostHog has never been initialised on `customer-web` (recorded
under 033 and again under 039), so `capture()` is a no-op on this surface and has been for eleven
slices. Declaring events that do not fire is only acceptable because **none of this slice's success
criteria are measured through them** — SC-001 through SC-017 are observational or mechanical. Fixing
the initialisation is a real slice with a real bundle cost on budgeted guest routes, and it is not
this one.

**Metrics/alerts**: none. This slice adds no backend behaviour, so there is nothing new to meter.

---

## R14 — Backend path (Principle III)

**Decision**: **neither path.** No hot-path handler, no cold-path Lambda, no new endpoint, no
migration.

The only backend file touched is `apis/edge-api/customer/src/newsletter/service.ts`, and only to
replace two locally-declared constants with an import of the same values from the shared package
(R2). No request, response, behaviour or stored value changes; its existing tests are the proof.

---

## R15 — What must not move

Carried forward as constraints, restated so they are not re-derived:

- **Enumeration.** No screen may reveal whether an address has an account — not through copy, not
  through a control's presence, not through timing. In particular the new validation must refuse a
  **malformed** address and must never refuse an **unknown** one (FR-044). The invariance test at
  `app/(auth)/_components/enumeration.test.ts` stays green.
- **Refusal copy on the sign-in code route.** The platform genuinely cannot distinguish wrong /
  expired / superseded / never-sent, and this redesign must not invent a reason to make a screen read
  better (FR-018).
- **No auto-submit at the sixth digit** (FR-005). Codes die after three wrong attempts and most
  customers have no password.
- **No truncation of a long paste** (FR-004).
- **The password manager pairing** — the email field stays mounted and `autocomplete="username"` on
  both credential steps (FR-040).
- **The Amplify quarantine.** Nothing new may make the auth SDK reachable from a public page; the
  `dependency-cruiser` rule matches transitively and must stay clean.
- **The guest bundle budget.** Ten routes, 174 KB. `app/delete-account/GuestDataControl.tsx` reaches
  the `@effy/design-system/ui` barrel, so a change to `otp-input.tsx` is measured on a budgeted route
  whether or not it is used there (SC-012).
