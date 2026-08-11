# Quickstart — 044 Customer Storefront Authentication Redesign

The verification walk for this slice. §1 is **blocking and runs before any code changes**. §2–§4 are
the mechanical gates. §5–§7 are the walks that no test can substitute for.

**No operator cloud step is required.** There is no migration, no deploy, no Terraform apply, and
nothing touching live AWS beyond signing in to the existing dev pools with a real inbox.

---

## Prerequisites

```bash
pnpm install                       # after the shared-types export lands, so workspaces relink
cd apps/customer-web
cp .env.example .env.local         # if not already present — existing dev Cognito ids
pnpm dev                           # http://localhost:3000
```

A real inbox you control, reachable by the dev customer pool. Codes are six digits, valid for five
minutes, and die after three wrong attempts — budget accordingly, and note the platform allows
**five sends per address per clock hour**.

Browser devtools open with the **console visible** throughout §1: one of the things being looked for
is a message the browser logs but never shows the customer.

---

## §1 — BASELINE (blocking, before any code changes)

Two entries in the spec's defect register could not be confirmed by reading the code. They are
observed first, and the result is written to `specs/044-customer-auth-redesign/BASELINE.md`
**whether or not they reproduce**. A fix for a defect nobody has seen is a change with no evidence
behind it; a register that records a guess as a fact is worse than one that records nothing.

### 1a — D-11: can a step advance on an empty or malformed email?

Walk **all five** entry points. For each, try (i) submit with the field **empty**, (ii) submit with
`person@example` — a syntactically legal address with no dot in the domain.

| # | Screen | How to reach it |
|---|---|---|
| 1 | Sign-in · email | `/sign-in` |
| 2 | Sign-in · password | `/sign-in` → "Use a password instead" |
| 3 | Sign-up · email | `/sign-up` |
| 4 | Sign-up · password | `/sign-up` → "Set a password instead" |
| 5 | Reset · email | `/reset-password` |

For each of the ten cases record: **did the step advance?** · **was anything shown, and where?** ·
**was anything logged to the console?** · **was a code actually requested?** (Network tab.)

> Expected from the code reading: the browser blocks the empty case with its own bubble, and
> **accepts `person@example`** and requests a code for it. If the empty case advances anywhere, that
> is a finding the reading missed and it is written down as such. Watch specifically for
> `An invalid form control … is not focusable` in the console — that is a *silent* block, which looks
> identical to "nothing happened".

### 1b — D-21: the bottom action under a software keyboard

On a real phone (or a device-mode viewport with a simulated keyboard), on `/sign-in` and on the code
step: focus the field, let the keyboard open, and record whether the committing action is still
visible and reachable. Repeat in **landscape** on a short screen.

### 1c — Record the starting point

```bash
cd apps/customer-web && pnpm build && pnpm size
```

Copy the nine-route table into `BASELINE.md`. Every later bundle claim is a delta against this, not
against a remembered number.

---

## §2 — The console lock (SC-011) — run this early and often

The shared code control serves `shop-web` and `back-office`, whose emailed code is their **only**
credential. These tests are **not edited**; if one fails, the change is wrong.

```bash
cd /Users/janith/Projects/effy
pnpm --filter @effy/web-kit test          # OtpSignInCard.test.tsx — MUST pass unmodified
pnpm --filter @effy/customer-web test     # otp-input.test.tsx plain block — MUST pass unmodified
pnpm turbo build --filter=@effy/shop-web --filter=@effy/back-office
```

Then look at both consoles' sign-in screens in a browser and confirm the code field is unchanged.

---

## §3 — The workspace gates

```bash
cd /Users/janith/Projects/effy
pnpm -r typecheck                     # expect the full package count, and COUNT it — a package that
                                      # stops reporting is a package that stopped being checked (029)
pnpm -r test
pnpm --filter @effy/design-system run tokens:check     # Compose theme drift — expect UNCHANGED
node packages/design-system/scripts/check-tokens.mjs   # AA contrast + token guards
./scripts/check-no-emerald.sh && ./scripts/check-no-jade.sh
make storefront-locks                 # 039 FR-002 — the header/nav/product-card/footer baseline
```

```bash
cd apps/customer-web
pnpm depcruise                        # the Amplify quarantine — must stay clean
pnpm build && pnpm size               # 9 routes / 174 KB. Record the delta vs §1c.
pnpm e2e
```

⚠ **`pnpm -r test` does not run `tsc`.** Run both, and count the reporting packages in each — 029
shipped with a green test run and a failing typecheck, and the only signal was a count falling by one.

⚠ **Do not raise the bundle limit to make `size` pass.** That instruction is written into the gate
script itself.

---

## §4 — Contract checks

Against [`contracts/otp-cells.contract.md`](contracts/otp-cells.contract.md) and
[`contracts/auth-validation.contract.md`](contracts/auth-validation.contract.md):

- **C-01** the cell count comes from `OTP_LENGTH` — grep the diff for a literal `6`; there must be none.
- **C-11** paste an 8-digit string into the code field: it is **not** shortened, the excess is visible,
  the action stays unavailable, and the control changes shape.
- **C-12** type the sixth digit and stop: **nothing submits**.
- **V-03** `apis/edge-api/customer` tests pass **unmodified** — the proof the email-rule extraction
  changed no behaviour.
- **V-14** with devtools' Network tab open, submit a malformed address: **no request leaves the page.**
- **V-20** `enumeration.test.ts` passes unmodified.

---

## §5 — The responsive and appearance walk (SC-006, SC-007, SC-010)

Every screen: sign-in email · sign-in password · sign-up email · sign-up password · **code** ·
**name** · reset email · reset code · reset new-password · callback.

At **320 · 375 · 768 · 1440** px.

⚠ **NOT in dark — the storefront has no dark appearance.** `customer-web` is light-only by a recorded
operator decision: it ships no appearance switcher, never applies the design system's dark class, and
pins the browser's own `color-scheme` to light. The spec originally asked for a dark walk here; that
was written without checking the surface, and FR-029 is amended. The design-system token gate still
checks every pair in both appearances, which is what keeps the shared control correct for the two
consoles.

- [ ] nothing clipped, no horizontal scroll (FR-026)
- [ ] the committing action is reachable without scrolling past the fields, **including with the
      keyboard open** (FR-027)
- [ ] one dominant alignment per screen — the code field shares its label's alignment (FR-008, FR-025)
- [ ] the heading does not outweigh the fields, and is sized for the width (FR-024)
- [ ] at ≥ lg the form is composed on the page, not stranded in white space (FR-028)
- [ ] the name step's fields are stacked, not halved, on a small phone (FR-033)
- [ ] the loading placeholder is roughly the shape of the form that replaces it (FR-032)

Then, with **colour removed** (devtools → Rendering → Emulate vision deficiency → Achromatopsia):

- [ ] every state is still understandable — available vs unavailable action, error vs hint, active
      cell vs empty cell (SC-010, FR-019). ⚠ This matters MORE on a light-only monochrome surface,
      not less: there is no second appearance to disambiguate anything, and no hue to spend.

And under **forced colors** (devtools → Rendering → Emulate CSS `forced-colors: active`):

- [ ] the code cells are still legible (C-16)

And at **200% browser zoom** and text-only zoom:

- [ ] the code cells still line up with their digits (C-17)

---

## §6 — The live journeys

Each with a real inbox against the dev pools.

**Sign in with a code** — enter the address, receive the code, note that the six positions are
obvious, type it, sign in. Then repeat and: mistype one digit (the other five survive — SC-005);
wait for the countdown and resend; paste eight digits; press the action with four digits entered and
confirm it **says what is missing** rather than doing nothing (V-17).

**Register** — sign up by code, confirm, reach the name step. Take the **skip** route and land in the
shop signed in with nothing suggesting the account is broken (SC-014). Then register again and finish
the name step normally.

**Reset a password** — run it end to end and confirm the sign-in screen you land on **says the
password was changed** (SC-013, D-14). Then hand-edit the URL to `?reason=<something-invented>` and
confirm **nothing is rendered** — the value is attacker-controlled and must never be echoed.

**Password route** — sign in with a password; confirm a password manager still fills, and still offers
to save (FR-040, V-22).

**The malformed address** — `person@example` is refused before anything is sent (SC-004).

---

## §7 — The walks a green suite cannot replace

039's lesson, stated as a step: layout, contrast and hierarchy are not properties a DOM assertion can
see. Four defects shipped there with a fully green suite.

- **SC-001** — five people, on a phone, unprompted: all identify where the code is typed within three
  seconds, without asking.
- **SC-002** — none of those five describes the unavailable action as "pressable".
- **SC-016** — three observers, shown the auth screens beside the storefront home, judge them to be
  the same shop.
- **SC-009** — a screen-reader pass through sign-in by code: each step announced **once**, the code
  field announced as **one** field, each refusal announced **once**, and nothing stealing focus while a
  field is being typed in.
- **SC-008** — every interactive target meets 44px. Measure; do not assume. 033 shipped a 32px target
  directly under a comment claiming it cleared the minimum.
- **SC-015** — read the diff: no screen declares its own copy of a control, field, heading or spacing
  definition that `components/storefront/kit.tsx` already defines.
- **SC-017** — walk the spec's defect register D-01…D-21 and mark each **fixed and demonstrated**, or
  **explicitly out of scope with a reason**. Nothing is left implicitly handled.

---

## Known carry-forwards (not this slice)

Recorded so they are not mistaken for this slice's gaps:

- **PostHog has never been initialised on `customer-web`**, so the three events this slice declares
  will not fire. No success criterion here depends on telemetry — that is why declaring them is
  acceptable. Eleventh consecutive slice.
- **`customer-mobile` runs the same journeys** and is untouched. Record the divergence in
  [`docs/audiences/customer-capabilities.md`](../../docs/audiences/customer-capabilities.md).
- **The newsletter form still relies on the browser's own validation.** The email rule it declared is
  now shared, so the fix is a small follow-up — deliberately not bundled here.
- **Google sign-in remains parked.** Restyled, not connected.
- **Three storefront e2e specs stale since 025**, and two `a11y` tests referencing a removed delivery
  control (recorded under 039, verified against a clean HEAD build). Not this slice's.
