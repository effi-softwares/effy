import * as React from "react"

import { cn } from "../cn"

/**
 * The platform's one-time-code field (035 FR-025, FR-026).
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
 *     dependency of this monorepo. `apps/customer-web` guest routes sit 2.1–5.5 KB under a 174 KB
 *     gate. A new dependency in this barrel risks that budget on routes that never render a code
 *     field, and the budget script's own instruction is "Do NOT raise the limit to make this pass."
 *  3. It is less code.
 *
 * ⚠ KEEP THIS FILE FREE OF `aws-amplify` AND ANY DATA FETCHING. It is imported on guest paths, and
 * `apps/customer-web`'s dependency-cruiser quarantine matches transitively (`reachable: true`).
 * The sign-in call belongs in `app/(auth)/`, not here.
 *
 * ⚠ `maxLength` is 6 and is a UX affordance ONLY. The server refuses anything that is not exactly
 * six digits rather than reshaping it (FR-005) — trimming a longer paste down to six is precisely
 * the shipped defect this feature exists to fix, and must not be reintroduced here.
 */
function OtpInput({ className, ...props }: React.ComponentProps<"input">) {
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
      maxLength={6}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      data-slot="otp-input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        // Codes are read back character by character far more often than prose is, so they get
        // tabular figures and a little tracking. This is the one place that is worth it.
        "font-mono tracking-[0.35em]",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { OtpInput }
