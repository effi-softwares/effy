"use client"

import * as React from "react"

import { cn } from "../cn"

/** The one code length on the web; the backend's is `OTP_LENGTH` in `apis/edge-api/auth/src/otp/policy.ts`. */
export const OTP_LENGTH = 6

/** The cell positions, derived from the length. */
const POSITIONS = Array.from({ length: OTP_LENGTH }, (_, i) => i)

/**
 * The one-time-code field: one input, not six boxes, so assistive technology sees a single field and
 * no extra dependency lands on guest routes. No `aws-amplify` or data fetching here: it is imported on
 * guest paths.
 *
 * `maxLength` is a UX affordance on the plain variant only; the server refuses anything but six digits
 * rather than reshaping it. `variant` defaults to `"plain"`, which the consoles' `OtpSignInCard` uses.
 * The `cells` variant draws the digits and the boxes as the same grid cells, so nothing can slide out
 * of alignment and it survives text-only zoom.
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
      // Plain variant only (the consoles); the customer surfaces never truncate.
      maxLength={OTP_LENGTH}
      data-slot="otp-input"
      data-variant="plain"
      className={cn(
        // Squared, 36px: the same base as `input.tsx`, minus the `file:` affordances.
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        // Tabular figures and a little tracking: codes are read back digit by digit.
        "font-mono tracking-[0.35em]",
        // No focus halo, as in `input.tsx`. The `cells` variant keeps its own per-cell indicator.
        "focus-visible:border-ring",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

/** Semantics both variants share. */
const INPUT_SEMANTICS = {
  // `text` + `inputMode="numeric"`, never `type="number"`, which strips leading zeros and accepts "1e5".
  type: "text",
  inputMode: "numeric",
  // The token both iOS and Android look for to offer the code from a message.
  autoComplete: "one-time-code",
  // Codes are digits; a pattern keeps mobile keyboards numeric and helps native validation.
  pattern: "[0-9]*",
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
  // A code is LTR even on an RTL page, or the first digit would land in the last box.
  dir: "ltr",
} as const

/**
 * Six drawn cells and one input. The cells are `aria-hidden`; the input over them holds the value,
 * focus and paste. Its text and caret are transparent, not hidden, which keeps paste, message autofill
 * and selection working; the cost is that a selection inside it is not visible.
 */
function OtpCells({
  className,
  value,
  defaultValue,
  onChange,
  ...props
}: React.ComponentProps<"input">) {
  // Mirrors the value so the cells render for an uncontrolled caller too.
  const [mirror, setMirror] = React.useState(String(defaultValue ?? value ?? ""))
  const shown = value !== undefined ? String(value) : mirror

  const overflowing = shown.length > OTP_LENGTH
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true"

  return (
    <div
      className={cn(
        // Fills its column, so it aligns with its label; `group` + `:focus-within` tells the cells about focus.
        "group relative w-full",
        className
      )}
      data-slot="otp-cells"
    >
      <input
        {...INPUT_SEMANTICS}
        // No `maxLength`: a code that is not six digits must be seen, not silently trimmed.
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
          // Selection stays visible, or select-all would look like an empty field.
          "selection:bg-primary/20",
          // An over-length value is shown as plain text: six cells would make it look like a valid code.
          overflowing && "border-2 border-destructive bg-background px-3 text-center font-mono text-lg text-foreground caret-auto"
        )}
        {...props}
      />

      {/* The scenery. Skipped entirely while the value is too long — the input above is showing real
          text at that point and boxes behind it would be nonsense. */}
      {!overflowing && (
        <div
          aria-hidden
          // Flex, not a stretching grid. Each cell is a fixed square (see `Cell`), so the row must
          // not stretch them to fill the column — it lays them out left-aligned at their own size,
          // still flush with the label above (the group stays `w-full`, so the transparent input
          // overlay keeps covering the full field). The cell count still comes from `POSITIONS`
          // (derived from `OTP_LENGTH`), so no literal "six" is written down here.
          className="pointer-events-none flex gap-2 sm:gap-2"
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
 * Every state shows by shape or weight as well as colour: empty a mid-weight boundary, filled a
 * full-contrast one and a glyph, active an offset ring and a caret, invalid the destructive boundary
 * and the message. The boundary is `border-ring` (over 3:1), not the untested `border-input`.
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
        // `bg-background`, so empty cells do not look disabled and the signal is on the boundary: 1.5px
        // `border-ring` (the colour has no headroom above 3:1; the weight does). The same size in every
        // state, so the row never shifts while typing; a fixed 44/48px square set only here, large
        // because codes are typed under time pressure.
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 bg-background transition-colors sm:h-12 sm:w-12",
        "font-mono text-lg tabular-nums text-foreground sm:text-xl",
        filled ? "border-foreground" : "border-ring",
        // The error is on the cells too, not only in the message.
        invalid && "border-destructive",
        // The active position, revealed only while the field actually has focus.
        active &&
          !invalid &&
          "group-focus-within:border-foreground"
      )}
    >
      {char ?? ""}
      {/* The caret's replacement (the real one is transparent), revealed by CSS only on the active
          position while focused, so it needs no state. */}
      {active && !filled && (
        <span
          data-slot="otp-caret"
          className="hidden h-5 w-1 animate-pulse bg-foreground group-focus-within:block motion-reduce:animate-none sm:h-6"
        />
      )}
    </div>
  )
}

export { OtpInput }
