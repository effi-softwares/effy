# BASELINE — 044, observed before any source file was changed

**Date**: 2026-08-11
**Build**: production (`next build && next start`), `apps/customer-web` @ HEAD `71f936a`, dev Cognito
pools, `ap-southeast-2`.
**Method**: automated observation via three throwaway Playwright specs (`e2e/baseline-d11.spec.ts`,
`e2e/baseline-d21.spec.ts`, `e2e/baseline-probe.spec.ts`), deleted after this record was written.

⚠ **Screenshots were taken and deliberately not committed.** `specs/` is text-only in this repository
(396 files, no binaries), and a picture is a weaker record than the geometry below anyway — the
measured positions, widths, derived type size and contrast ratios are what actually establish each
defect. That is why they are written out rather than pointed at.

This file exists because two entries in the spec's defect register (**D-11**, **D-21**) were reported
or suspected but **could not be confirmed by reading the code**. Both are now settled, and the
answers are not the ones the register assumed.

---

## Starting measurements

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | **14/14 packages**, exit 0 |
| `pnpm -r test` | **14/14 packages**, exit 0 |
| `pnpm build` | exit 0 |

### Guest bundle (`pnpm size`) — the deltas everything later is measured against

⚠ **The gate measures NINE routes, not ten.** `plan.md`, `quickstart.md` and
`contracts/otp-cells.contract.md` each say "ten"; they are wrong and are corrected. `GUEST_PAGES` in
`scripts/bundle-budget.mjs` has nine entries.

| Route | Baseline | Headroom |
|---|---|---|
| `/` | 173.0 KB | 1.0 KB |
| `/search` | **173.9 KB** | **0.1 KB** |
| `/product/[id]` | 170.7 KB | 3.3 KB |
| `/cart` | 172.4 KB | 1.6 KB |
| `/promotions/[id]` | 169.5 KB | 4.5 KB |
| `/newsletter/confirm` | 168.4 KB | 5.6 KB |
| `/delete-account` | 159.5 KB | 14.5 KB |
| `/legal/privacy` | 147.3 KB | 26.7 KB |
| `/legal/terms` | 147.3 KB | 26.7 KB |

⚠ **`/search` has 0.1 KB of headroom.** Anything this slice adds to a chunk shared with the guest
routes fails the build. `app/delete-account/GuestDataControl.tsx` reaches the
`@effy/design-system/ui` barrel, so `otp-input.tsx` is in the measured graph.

---

## D-11 — can a step advance on an empty or malformed email?

**Verdict: PARTIALLY CONFIRMED, and the confirmed half is worse than the report.**

Ten cases: five entry points × {empty, `person@example`}. For each: did the step advance · was
anything shown · what was logged · did a request actually leave the page.

### Empty submissions

| Entry point | Advanced | Message shown | Request sent |
|---|---|---|---|
| sign-in · email | no | none in the DOM | **none** |
| sign-in · password | no | none in the DOM | **none** |
| sign-up · email | no | none in the DOM | **none** |
| sign-up · password | no | none in the DOM | **none** |
| reset · email | no | none in the DOM | **none** |

**The browser's own enforcement does block the empty case on the first step of each journey**, exactly
as the code reading predicted. No `An invalid form control … is not focusable` was logged anywhere —
there is no silent block. The message is a browser-drawn bubble, which is why nothing appears in the
DOM.

⚠ **But the password steps are a different finding.** Reaching `/sign-in` → "Use a password instead"
**without ever filling the email**, then submitting a password, produces:

> **"Something went wrong. Please try again."**

The empty address reached `signInWithPassword("", …)` and was refused by the SDK client-side. So the
sign-in password step **does** advance past an empty email — the `readOnly` attribute that the code
reading identified as exempting the field from constraint validation is exactly what lets it through —
and the shopper is told *"something went wrong"* rather than *"enter your email"*. Same on the sign-up
password step.

**This is the half of D-11 that is real.** The register's wording ("a step can be advanced with an
empty email") is correct for the password steps and wrong for the first steps; the spec is amended
rather than left to imply more than was seen.

### Malformed submissions — `person@example`

| Entry point | Advanced | Message shown | Request sent |
|---|---|---|---|
| sign-in · email | no (request in flight) | none | **`POST https://cognito-idp.ap-southeast-2.amazonaws.com/`** |
| sign-up · email | **YES** | none | **`POST https://cognito-idp.ap-southeast-2.amazonaws.com/`** |
| reset · email | no | "Something in that form wasn't quite right. Check it and try again." | **`POST …amazonaws.com/`** → HTTP **400** |

**D-08 is confirmed, and confirmed live.** `person@example` is not refused anywhere. A request is
genuinely dispatched to Cognito for it, and on **sign-up the shopper is advanced to the code step** —
parked on a screen waiting for an email that cannot arrive, with nothing on the platform able to tell
them why.

---

## D-21 — is the bottom action reachable under a software keyboard?

**Verdict: NOT REPRODUCED on any screen that could be measured.**

A keyboard does not shrink `100vh`, so the proxy used was: shrink the viewport to what a keyboard
leaves behind and ask whether the action is inside it without scrolling.

| Screen | Viewport | Action `y` | In view without scrolling | Document height |
|---|---|---|---|---|
| sign-in · email | 360×640 | 285 | **yes** | 640 |
| sign-in · email | 360×340 (keyboard) | 285 | **yes** | 573 |
| sign-in · email | 740×360 (landscape) | 301 | **yes** | 605 |
| code step | 375×812 | 680 | **yes** | — |
| code step | 1440×900 | 625 | **yes** | — |

The action stays in view in every measured case. Note the document *does* overflow in the two short
viewports (573 > 340, 605 > 360), so the **footer** link falls below the fold — but the committing
action does not.

**D-21 is withdrawn as a defect and recorded as not reproduced.** The `svh`/`dvh` and sticky-footer
work in FR-027 remains worth doing as a robustness measure on a real device with a real keyboard, but
it is **not fixing an observed failure**, and the spec must not claim it is.

---

## D-01 / D-02 — confirmed numerically, and a THIRD defect found

The code step was reachable without a real mailbox (035's enumeration defence issues a challenge for
an unknown address), so the screen the operator photographed was reproduced exactly. The measurements
below are what that reproduction established.

| Width | Auth column | OTP field | Verdict |
|---|---|---|---|
| 375 | x 16 → 359 (343 px) | x **104**, width **271** → ends at **375** | starts 88 px inside the column and **overflows its right edge by 16 px** |
| 1440 | x 528 → 912 (384 px) | x **798**, width **126** → ends at **924** | starts 270 px inside the column and **overflows its right edge by 12 px** |

**D-02 confirmed**: the field is not centred and is not inside its own column — the inline
`marginRight` beating `mx-auto` leaves `margin-left: auto` to push it right, exactly as the plan
predicted.

### ⚠ NEW — D-01a: the code field collapses to 14 px on desktop

The measured widths imply the character advance: 271 px / 15ch → 1ch ≈ 18 px (a 30 px font, correct);
126 px / 15ch → 1ch ≈ 8.4 px → **a ~14 px font**.

Cause: the base class string ends `… md:text-sm dark:bg-input/30` and the cells variant appends
`text-3xl`. `tailwind-merge` does **not** treat `md:text-sm` and `text-3xl` as conflicting — they are
different responsive variants — so **both survive**, and at ≥768 px `md:text-sm` wins. The code field
is therefore rendered at roughly **half the intended size on every desktop**, which is why the
operator's screenshot shows six faint marks rather than a field.

This defect is **not in the spec's register** because it was invisible to code reading and only fell
out of measuring the rendered geometry. It is added as **D-01a** and is fixed by the same task that
rebuilds the control (T028–T030).

---

## ⚠ THE STOREFRONT HAS NO DARK MODE — found while capturing the baseline shots

The "dark" screenshots came out identical to the light ones. The cause is not the capture: **the
customer storefront is light-only, by a recorded operator decision.** `apps/customer-web/app/layout.tsx`
never applies the design system's dark class and says so in a comment, and `app/globals.css` pins
`color-scheme: light` so the browser's own chrome cannot render dark over a light page.

**The spec was wrong**, and it was wrong because it was written from the design system rather than
from the surface: FR-029, SC-006, SC-007 and US3's fifth acceptance scenario all demanded a dark-mode
walk of a surface that has no dark mode. That obligation was **untestable by construction**, and a
sign-off claiming it had been verified would have been a false claim.

Amended rather than quietly satisfied. What replaces it: every colour must still come from a
design-system token, so the shared code control resolves correctly for the two consoles (which *do*
have a dark appearance) and for this storefront if the decision is ever revisited. The token gate
continues to check every pair in both appearances regardless.

Note this also raises the stakes on **SC-010** (understandable with colour removed): a light-only
monochrome surface has no second appearance to disambiguate a state and no hue to spend, so shape and
weight are carrying all of it.

---

## Consequences for the artifacts

1. **Spec D-11** is amended: the empty case is blocked on the first steps and **not** on the password
   steps; the malformed case is confirmed everywhere, with a live request dispatched.
2. **Spec D-21** is amended to **not reproduced**, with the measurements recorded. FR-027 stays, its
   justification changes from "fixes an observed failure" to "robustness on real devices".
3. **New defect D-01a** is added to the register.
4. **"Ten routes"** is corrected to **nine** in `plan.md`, `quickstart.md` and
   `contracts/otp-cells.contract.md`.
5. **`/search` at 0.1 KB headroom** is flagged as the binding bundle constraint for this slice.
