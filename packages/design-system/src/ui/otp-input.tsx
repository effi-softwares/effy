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

/**
 * The platform's one-time-code field (035 FR-025, FR-026; 036 FR-002).
 *
 * ⚠ ONE INPUT, NOT SIX BOXES — and that is a requirement, not a style preference.
 *
 * Three independent reasons converge on the plain field:
 *
 *  1. **Assistive technology.** FR-025 requires the control to present as a SINGLE logical field.
 *     Segmented per-digit widgets are several inputs wearing a costume; they are the reason screen
 *     reader users lose their place in OTP forms. The mobile half of this platform already
 *     documents the same intent ("One logical email-code editor… a single accessibility/focus
 *     node") and has a test asserting exactly one such node.
 *  2. **The bundle.** shadcn's `InputOTP` wraps the `input-otp` npm package, which is not a
 *     dependency of this monorepo. `apps/customer-web` guest routes sit 2.0–5.9 KB under a 174 KB
 *     gate (`/search` and `/cart` are BOTH at 2.0 KB). A new dependency in this barrel risks that
 *     budget on routes that never render a code field, and the budget script's own instruction is
 *     "Do NOT raise the limit to make this pass."
 *  3. It is less code.
 *
 * ⚠ KEEP THIS FILE FREE OF `aws-amplify` AND ANY DATA FETCHING. It is imported on guest paths, and
 * `apps/customer-web`'s dependency-cruiser quarantine matches transitively (`reachable: true`).
 * The sign-in call belongs in `app/(auth)/`, not here.
 *
 * ⚠ `maxLength` is `OTP_LENGTH` and is a UX affordance ONLY. The server refuses anything that is not
 * exactly six digits rather than reshaping it (FR-005) — trimming a longer paste down to six is
 * precisely the shipped defect this feature exists to fix, and must not be reintroduced here.
 *
 * ── 036: the `cells` variant ──────────────────────────────────────────────────────────────────────
 *
 * ⚠ `variant` DEFAULTS TO `"plain"`, and that default is load-bearing. This component is shared with
 * `packages/web-kit`'s `OtpSignInCard`, which serves `apps/back-office` and `apps/shop-web` — both
 * OUT OF SCOPE for 036 (FR-044a). Those two consoles pass no `className` and opt into no variant, so
 * they keep today's rendering byte-for-byte. Four test files across three packages assert on this
 * component; they must pass UNMODIFIED as the proof the consoles were not disturbed.
 *
 * `"cells"` paints six character positions behind ONE input — it does not create six inputs. That is
 * GOV.UK's conclusion (they ship a single input with `letter-spacing` + tabular numerals) taken one
 * visual step further. `getAllByLabelText(/one-time code/i)` must still return exactly one node.
 */
function OtpInput({
  className,
  variant = "plain",
  style,
  ...props
}: React.ComponentProps<"input"> & { variant?: "plain" | "cells" }) {
  return (
    <input
      // `text` with `inputMode="numeric"`, never `type="number"`: a number input strips leading
      // zeros, exposes spinners, and silently accepts "1e5". Roughly one code in ten begins with a
      // zero, so `type="number"` would break 10% of sign-ins.
      type="text"
      inputMode="numeric"
      // The token both iOS and Android look for to offer the code from a message.
      autoComplete="one-time-code"
      // Codes are digits; a pattern keeps mobile keyboards numeric and helps native validation.
      pattern="[0-9]*"
      // ⚠ 036 FR-004 — `maxLength` TRUNCATES, and truncation is the defect 035 existed to fix.
      //
      // A native `maxLength` silently discards the 7th and 8th characters of a paste. On this
      // platform that is exactly wrong: a code that is not six digits did not come from us, and the
      // shopper needs to SEE that rather than have it quietly reshaped into something submittable.
      //
      // ⚠ It is dropped on the `cells` variant ONLY. The plain variant serves `back-office` and
      // `shop-web` (FR-044a, out of scope), and `OtpSignInCard.test.tsx` asserts `maxlength="6"` —
      // that test must keep passing UNMODIFIED as the proof those consoles were not disturbed. The
      // consoles keep today's behaviour until their own slice; the customer surfaces get the rule.
      maxLength={variant === "cells" ? undefined : OTP_LENGTH}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      // ⚠ A code is LTR content even on an RTL page, and the cell geometry below is built from
      // physical directions (`to right`, `background-position: 0 100%`). Under `dir="rtl"` the
      // underlines would land under the wrong characters.
      dir="ltr"
      data-slot="otp-input"
      data-variant={variant}
      style={variant === "cells" ? { ...CELL_GEOMETRY, ...style } : style}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        // Codes are read back character by character far more often than prose is, so they get
        // tabular figures and a little tracking. This is the one place that is worth it.
        "font-mono tracking-[0.35em]",
        // ⚠ The cell variant OWNS its box. It must beat the caller's `className`, which lands last in
        // `cn()` — the three `app/(auth)/` call sites pass `px-3 rounded-full`, and BOTH would destroy
        // the geometry: horizontal padding shifts every underline off its character, and a pill
        // radius clips the first and last cell. So: no border, no fill, no padding, no radius, and
        // `!` so a caller cannot re-add them by accident.
        variant === "cells" &&
          "!rounded-none !border-0 !bg-transparent !px-0 !shadow-none mx-auto block h-auto py-3 text-center !tracking-[var(--otp-gap)] text-3xl tabular-nums",
        // ⚠ `--otp-rule` lives in the CLASS layer, not in `CELL_GEOMETRY`. An inline custom property
        // wins on specificity, so setting it inline would make the invalid and focus states below
        // silently dead — the cells would stay grey while the field was announcing an error.
        variant === "cells" &&
          "[--otp-rule:var(--input)] focus-visible:[--otp-rule:var(--ring)] aria-invalid:[--otp-rule:var(--destructive)]",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        // ⚠ The ring would trace the invisible box, not the cells. The cells carry the focus and
        // error signal themselves via `--otp-rule` below.
        variant === "cells" && "focus-visible:!ring-0 focus-visible:!border-0",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

/**
 * Six character cells drawn as underlines behind one input.
 *
 * ⚠ WHY UNDERLINES AND NOT BOXES. The published "boxes behind a single input" technique needs
 * `clip-path`, a `conic-gradient` for the corners, and `attr(maxlength type(<integer>))` — which is
 * Chrome-only. Underlines need one `repeating-linear-gradient` and no clipping, so they survive
 * Safari, browser zoom and text-only zoom without a fallback path. The affordance is the same: six
 * visible positions.
 *
 * ⚠ WHY THIS IS AN INLINE STYLE AND NOT A CLASS IN `tokens.css`. `tokens.css` is PARSED by
 * `scripts/gen-compose-theme.mjs` — it reads `:root`/`.dark` blocks for colours and runs a whole-file
 * regex for `<name>: <number>rem` to pick up the radius scale. Adding unrelated rule blocks there
 * risks the `tokens:check` gate for no benefit, and this feature must leave that gate untouched
 * (SC-018). Nothing here is a token: every colour is an existing token variable.
 *
 * ⚠ SIZED TO BE SEEN, AND CENTRED RATHER THAN FULL-BLEED. The cells are driven by the font, so the
 * group's width is `6 × (1ch + gap)` — at a 30px monospace that is ≈250px inside a 384px column,
 * which is the published guidance: keep the digit group compact and centred, do not spread it across
 * a wide layout. (Mobile is the opposite case and DOES fill its column, because a phone's column IS
 * roughly that width — see `packages/mobile-kit/common/ui/OtpCells.kt`, which caps at 360dp for the
 * same reason.)
 *
 * ⚠ THE GEOMETRY. With `letter-spacing: g`, character *i* starts at `i × (1ch + g)` and is `1ch`
 * wide — so a gradient with period `1ch + g` that inks `[0, 1ch]` lands exactly under each character.
 * `1ch` is the advance of "0", which is only reliable in a monospace font; `--font-mono` is not
 * overridden in `tokens.css`, so Tailwind's monospace stack applies, and `tabular-nums` is belt and
 * braces. `scripts/check-tokens.mjs` asserts this (T013) — if `--font-mono` ever became proportional
 * the cells would drift out from under the digits with nothing failing.
 *
 * ⚠ THE TRAILING SPACE. `letter-spacing` is added after EVERY character including the last, so the
 * run is one gap wider than its ink. `marginRight` cancels it; without that the field is visibly
 * off-centre by one gap.
 */
const CELL_GEOMETRY = {
  "--otp-n": OTP_LENGTH,
  "--otp-cell": "1ch",
  "--otp-gap": "1.5ch",
  // ⚠ `--otp-rule` is deliberately NOT set here — see the class layer above. Inline custom
  // properties beat classes, which would kill the focus and invalid states.
  width: "calc(var(--otp-n) * (var(--otp-cell) + var(--otp-gap)))",
  marginRight: "calc(-1 * var(--otp-gap))",
  backgroundImage:
    "repeating-linear-gradient(to right, var(--otp-rule) 0 var(--otp-cell), transparent var(--otp-cell) calc(var(--otp-cell) + var(--otp-gap)))",
  backgroundSize: "calc(100% - var(--otp-gap)) 3px",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "0 100%",
} as React.CSSProperties

export { OtpInput }
