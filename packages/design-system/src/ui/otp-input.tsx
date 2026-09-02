"use client"

import * as React from "react"

import { cn } from "../cn"

/**
 * The platform's one and only code length (035 FR-001, 036 FR-045).
 *
 * ⚠ "Six" MUST have exactly one definition per platform. Before 036 this file carried a bare
 * `maxLength={6}` literal while three mobile files carried a hardcoded `"6-digit code"` placeholder
 * string — four places to change and no way to tell if you missed one. The backend's own definition
 * lives in `apis/edge-api/auth/src/otp/policy.ts` (`OTP_LENGTH`); this is the web mirror of it.
 */
export const OTP_LENGTH = 6

/** The cell positions, derived — so no literal `6` appears anywhere below (044 C-01). */
const POSITIONS = Array.from({ length: OTP_LENGTH }, (_, i) => i)

/**
 * The platform's one-time-code field (035 FR-025, FR-026; 036 FR-002; 044 US1).
 *
 * ⚠ ONE INPUT, NOT SIX BOXES — and that is a requirement, not a style preference.
 *
 * Three independent reasons converge on the single field:
 *
 *  1. **Assistive technology.** FR-025 requires the control to present as a SINGLE logical field.
 *     Segmented per-digit widgets are several inputs wearing a costume; they are the reason screen
 *     reader users lose their place in OTP forms. The mobile half of this platform already
 *     documents the same intent ("One logical email-code editor… a single accessibility/focus
 *     node") and has a test asserting exactly one such node.
 *  2. **The bundle.** shadcn's `InputOTP` wraps the `input-otp` npm package, which is not a
 *     dependency of this monorepo. `apps/customer-web` guest routes sit as little as 0.1 KB under a
 *     174 KB gate. A new dependency in this barrel risks that budget on routes that never render a
 *     code field, and the budget script's own instruction is "Do NOT raise the limit to make this
 *     pass."
 *  3. It is less code.
 *
 * ⚠ KEEP THIS FILE FREE OF `aws-amplify` AND ANY DATA FETCHING. It is imported on guest paths, and
 * `apps/customer-web`'s dependency-cruiser quarantine matches transitively (`reachable: true`).
 * The sign-in call belongs in `app/(auth)/`, not here.
 *
 * ⚠ `maxLength` is a UX affordance ONLY, and only on the plain variant. The server refuses anything
 * that is not exactly six digits rather than reshaping it (FR-005) — trimming a longer paste down to
 * six is precisely the shipped defect 035 existed to fix, and must not be reintroduced here.
 *
 * ── The `cells` variant, rebuilt in 044 ──────────────────────────────────────────────────────────
 *
 * ⚠ `variant` DEFAULTS TO `"plain"`, and that default is load-bearing. This component is shared with
 * `packages/web-kit`'s `OtpSignInCard`, which serves `apps/back-office` and `apps/shop-web` — both
 * OUT OF SCOPE (044 FR-042). Those two consoles pass no variant, so they keep today's rendering
 * byte-for-byte, and their emailed code is their ONLY credential: a regression there is a lockout,
 * not a cosmetic bug. `OtpSignInCard.test.tsx` and the plain block of `otp-input.test.tsx` must pass
 * UNMODIFIED as the proof.
 *
 * ⚠ WHY THE 036 RENDERING WAS REPLACED RATHER THAN TOUCHED UP. It painted six positions as a
 * `repeating-linear-gradient` behind text laid out with `letter-spacing` in `ch` units. Measured on
 * the shipped build (044 BASELINE.md), that produced three defects at once:
 *
 *   • **Invisible** — the rule used `--input` (`#e5e5e5`), whose own token comment says it is
 *     "deliberately not contrast-tested". At 1.24:1 on white it is not a boundary, it is a rumour.
 *   • **Off-centre** — an inline `marginRight` overrode one half of `mx-auto`, leaving
 *     `margin-left: auto` to shove the control against the right edge of its column. At 1440px it
 *     began 270px into a 384px column and overflowed the far edge by 12px.
 *   • **Half-size on desktop** — the base class string ends `md:text-sm` and the variant appended
 *     `text-3xl`. `tailwind-merge` does not treat those as conflicting (different responsive
 *     variants), so BOTH survived and `md:` won above 768px: a ~14px code field where 30px was
 *     intended.
 *
 * The rebuild removes the whole class of problem. **The digits and the boxes are now the same
 * elements**, laid out in one grid, so no font metric, no `ch` advance and no class-merge accident
 * can slide one out from under the other. There are no `ch` units left, which is also what makes the
 * control survive 200% zoom and text-only zoom (044 C-17).
 */
function OtpInput({
  className,
  variant = "plain",
  ...props
}: React.ComponentProps<"input"> & { variant?: "plain" | "cells" }) {
  if (variant === "cells") return <OtpCells className={className} {...props} />
  return (
    <input
      {...INPUT_SEMANTICS}
      // ⚠ 036 FR-004 — `maxLength` TRUNCATES, and truncation is the defect 035 existed to fix.
      //
      // It is kept on the PLAIN variant only. That variant serves `back-office` and `shop-web`
      // (044 FR-042, out of scope), and `OtpSignInCard.test.tsx` asserts `maxlength="6"` — that test
      // must keep passing UNMODIFIED as the proof those consoles were not disturbed. The consoles
      // keep today's behaviour until their own slice; the customer surfaces get the rule.
      maxLength={OTP_LENGTH}
      data-slot="otp-input"
      data-variant="plain"
      className={cn(
        // ⚠ SQUARED, h-9, px-3 — byte-for-byte `input.tsx`'s field base (minus the `file:` affordances
        // an OTP field never uses). The rule is unchanged and only the shape moved: the plain variant
        // IS an Input but for its tracking, so a differently-shaped box here would read as a foreign
        // component in the same sign-in form. `OtpSignInCard.test.tsx` asserts `maxlength`/behaviour,
        // not shape, so the consoles stay functionally identical — this is visual only.
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        // Codes are read back character by character far more often than prose is, so they get
        // tabular figures and a little tracking. This is the one place that is worth it.
        "font-mono tracking-[0.35em]",
        // No focus halo, matching `input.tsx` — the plain variant IS an `Input` in every respect but
        // its tracking, so a different focus treatment here would read as a bug. The `cells` variant
        // below keeps its own ring: that one is 044's authored per-cell focus indicator, not the
        // shadcn default, and it is the only thing marking which position is active.
        "focus-visible:border-ring",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

/**
 * Semantics shared by both variants. Every one of these is load-bearing behaviour rather than
 * presentation, so neither variant may drift from the other on any of them.
 */
const INPUT_SEMANTICS = {
  // `text` with `inputMode="numeric"`, never `type="number"`: a number input strips leading
  // zeros, exposes spinners, and silently accepts "1e5". Roughly one code in ten begins with a
  // zero, so `type="number"` would break 10% of sign-ins.
  type: "text",
  inputMode: "numeric",
  // The token both iOS and Android look for to offer the code from a message.
  autoComplete: "one-time-code",
  // Codes are digits; a pattern keeps mobile keyboards numeric and helps native validation.
  pattern: "[0-9]*",
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
  // ⚠ A code is LTR content even on an RTL page. The cells are laid out left-to-right by position
  // index, and under `dir="rtl"` the first character typed would appear in the last box.
  dir: "ltr",
} as const

/**
 * Six character cells, and one input.
 *
 * ⚠ THE CELLS ARE `aria-hidden` SCENERY. Everything a person or a screen reader interacts with is
 * the single `<input>` layered over them: it holds the value, takes the focus, receives the paste,
 * and is what `getAllByLabelText` finds exactly one of. The boxes below it are drawn, not operated.
 *
 * ⚠ THE INPUT'S OWN TEXT AND CARET ARE TRANSPARENT, not hidden. Keeping a real, full-size,
 * text-bearing input in place is what preserves paste, OS message-autofill, selection semantics and
 * the browser's own autofill anchoring. The visible digits are rendered by the cells from the same
 * value.
 *
 * **The accepted cost, recorded rather than discovered:** a text selection inside the field is not
 * visible. A six-digit code is retyped, not partially selected, and the alternative (a visible
 * selection) costs the per-cell rendering that fixes everything else.
 */
function OtpCells({
  className,
  value,
  defaultValue,
  onChange,
  ...props
}: React.ComponentProps<"input">) {
  // Mirrors the value so the cells can render it whether the caller controls the input or not.
  // Controlled is the norm (`CodeStep` owns the value); the fallback keeps an uncontrolled caller
  // from rendering six permanently empty boxes over a field that has text in it.
  const [mirror, setMirror] = React.useState(String(defaultValue ?? value ?? ""))
  const shown = value !== undefined ? String(value) : mirror

  const overflowing = shown.length > OTP_LENGTH
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true"

  return (
    <div
      className={cn(
        // ⚠ NO `mx-auto`, NO NEGATIVE MARGIN, NO INTRINSIC WIDTH. The group fills its column and is
        // therefore aligned with its own label by construction — there is no centring rule left for
        // an inline style to half-override, which is what defect D-02 was (044 C-04).
        //
        // `group` + `:focus-within` is how the cells learn that the input has focus. It needs no
        // state and no ordering assumption about which element comes first in the DOM.
        "group relative w-full",
        className
      )}
      data-slot="otp-cells"
    >
      <input
        {...INPUT_SEMANTICS}
        // ⚠ NO `maxLength` HERE. A native one silently discards the 7th and 8th characters of a
        // paste; on this platform a code that is not six digits did not come from us, and the shopper
        // must SEE that rather than have it quietly reshaped into something submittable (FR-004).
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          setMirror(e.target.value)
          onChange?.(e)
        }}
        data-slot="otp-input"
        data-variant="cells"
        className={cn(
          "absolute inset-0 z-10 h-full w-full rounded-md bg-transparent text-transparent caret-transparent outline-none",
          // The focus indicator lives on the cells (below), which is where a person is looking.
          "focus-visible:outline-none",
          // ⚠ Text is transparent but SELECTION must not be — a selected-all state with an invisible
          // highlight and invisible glyphs looks like an empty field.
          "selection:bg-primary/20",
          // ⚠ An over-length value is shown as PLAIN TEXT, in full. Six positions can only display
          // six characters, so an eight-digit paste rendered as cells would LOOK like a six-digit
          // code — visually reproducing the very truncation FR-004 forbids. Changing shape is the
          // signal (044 C-11).
          overflowing && "border-2 border-destructive bg-background px-3 text-center font-mono text-lg text-foreground caret-auto"
        )}
        {...props}
      />

      {/* The scenery. Skipped entirely while the value is too long — the input above is showing real
          text at that point and boxes behind it would be nonsense. */}
      {!overflowing && (
        <div
          aria-hidden
          // ⚠ FLEX, NOT A STRETCHING GRID. Each cell is a FIXED square (see `Cell`), so the row must
          // not stretch them to fill the column — it lays them out left-aligned at their own size,
          // still flush with the label above (the group stays `w-full`, so the transparent input
          // overlay keeps covering the full field). The cell count still comes from `POSITIONS`
          // (derived from `OTP_LENGTH`), so no literal "six" is written down here (044 C-01).
          className="pointer-events-none flex gap-1.5 sm:gap-2"
        >
          {POSITIONS.map((i) => (
            <Cell
              key={i}
              char={shown[i]}
              index={i}
              filled={i < shown.length}
              invalid={invalid}
              // The position the next character will land in. Clamped, so a full value keeps the
              // indicator on the last cell rather than dropping it off the end.
              active={i === Math.min(shown.length, OTP_LENGTH - 1)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One character position.
 *
 * ⚠ EVERY STATE IS CARRIED BY SHAPE OR WEIGHT AS WELL AS COLOUR (044 FR-019, SC-010): an empty cell
 * has a mid-weight boundary, a filled one a full-contrast boundary and a glyph, the active one an
 * offset ring and a caret, an invalid one the destructive boundary *and* the error message beside
 * the field. None of them is distinguishable by hue alone, which matters on a monochrome platform
 * where there is no hue to spend.
 *
 * ⚠ THE BOUNDARY IS `border-ring`, NOT `border-input`. `--input` is `#e5e5e5` on white — 1.24:1, and
 * its own token comment says it is "deliberately not contrast-tested". `--ring` is `#808080` light /
 * `#737373` dark, both above the 3:1 WCAG 1.4.11 bar for a UI component boundary. Using the border
 * token here is what made the field invisible (defect D-01).
 */
function Cell({
  char,
  index,
  filled,
  invalid,
  active,
}: {
  char: string | undefined
  index: number
  filled: boolean
  invalid: boolean
  active: boolean
}) {
  return (
    <div
      data-slot="otp-cell"
      data-index={index}
      data-filled={filled || undefined}
      data-active={active || undefined}
      className={cn(
        // ⚠ `bg-background`, NOT `bg-muted` (operator direction 2026-08-11). The muted fill read as
        // a *filled* control — darker than the page — which made six empty boxes look like six
        // disabled ones. The page-coloured fill puts the whole signal on the boundary, which is why
        // that boundary is `border-ring` (3:1) and 2px rather than the untested hairline token.
        // ⚠ 1.5px, DOWN FROM 2px (operator direction 2026-08-11 — "borders are too dark"). The weight
        // is what was lightened, not the colour, and that is a measured constraint rather than a
        // preference: `--ring` (#808080) is **3.95:1** on white, and WCAG 1.4.11 wants **3:1** for the
        // visual boundary of a UI component. The lightest grey that still clears that bar is roughly
        // #959595 — barely distinguishable from what is here — so there is almost no colour headroom
        // left to spend. Stroke weight is where the headroom actually is: half a pixel off reads
        // markedly lighter and costs no contrast at all.
        //
        // ⚠ The size is UNIFORM across states on purpose. Varying it between empty and filled would
        // change each cell's box size as the shopper types, so the row would shift under their
        // fingers mid-code.
        //
        // ⚠ A FIXED SQUARE: 44×44px below `sm`, 48×48px at/above it. `shrink-0` so the flex row can
        // never compress them narrower than tall. The size is set HERE and nowhere else, so no
        // responsive utility from an unrelated class string can halve it the way `md:text-sm` did
        // (defect D-01a).
        // ⚠ 057: `rounded-md` (6px). The cells stay LARGE (44/48px) because a one-time code is typed
        // under time pressure and often on a tablet — that is a touch-target decision, not a radius
        // one, and squaring the corners does not shrink the target.
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-[1.5px] bg-background transition-colors sm:h-12 sm:w-12",
        "font-mono text-lg tabular-nums text-foreground sm:text-xl",
        filled ? "border-foreground" : "border-ring",
        // ⚠ The ERROR IS ON THE CELLS, not only in the message beside them (044 C-06/FR-007). A
        // refusal the shopper has to read to notice is a refusal they will retype into.
        invalid && "border-destructive",
        // The active position, revealed only while the field actually has focus.
        active &&
          !invalid &&
          "group-focus-within:border-foreground group-focus-within:ring-2 group-focus-within:ring-ring group-focus-within:ring-offset-2 group-focus-within:ring-offset-background"
      )}
    >
      {char ?? ""}
      {/* The caret's replacement, since the real one is transparent (044 C-05/C-15). Rendered for
          every cell and revealed by CSS only on the active position while the field has focus, so
          it costs no state and cannot disagree with the value. */}
      {active && !filled && (
        <span
          data-slot="otp-caret"
          className="hidden h-5 w-0.5 animate-pulse bg-foreground group-focus-within:block motion-reduce:animate-none sm:h-6"
        />
      )}
    </div>
  )
}

export { OtpInput }
