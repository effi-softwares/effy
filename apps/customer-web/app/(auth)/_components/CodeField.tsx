"use client"

import * as React from "react"

import { OTP_LENGTH } from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

/** The slot positions, in the reference's two joined groups — derived, so no literal six appears. */
const HALF = Math.ceil(OTP_LENGTH / 2)
const GROUPS = [
  Array.from({ length: HALF }, (_, i) => i),
  Array.from({ length: OTP_LENGTH - HALF }, (_, i) => HALF + i),
]

/**
 * The emailed-code field in the storefront's shape (reference: Sign in — code): two joined groups of
 * slots with a dash between them.
 *
 * ⚠ ONE INPUT, NOT SIX — the same rule as the platform's `OtpInput`, whose reasoning this follows.
 * The slots are `aria-hidden` scenery; the single transparent `<input>` layered over them holds the
 * value, takes the focus, receives a paste and the phone's code autofill, and is the one field a
 * screen reader meets.
 *
 * ⚠ NO `maxLength`, AND NOTHING IS TRUNCATED (036 FR-004). A value longer than the code is shown in
 * full as plain text instead of slots — slots can only show their own count of characters, so a longer
 * paste drawn in them would look like a valid code.
 */
export function CodeField({
  value,
  invalid = false,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "type"> & { value: string; invalid?: boolean }) {
  const overflowing = value.length > OTP_LENGTH
  // Where the next character lands. Clamped, so a full code keeps the mark on the last slot.
  const active = Math.min(value.length, OTP_LENGTH - 1)

  return (
    <div data-slot="otp-cells" className={cn("group relative w-fit max-w-full", className)}>
      <input
        // `text` + `inputMode`, never `type="number"`: that strips the leading zero one code in ten has.
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        dir="ltr"
        value={value}
        aria-invalid={invalid || overflowing || undefined}
        data-slot="otp-input"
        className={cn(
          // 16px text even though it is invisible: below that, iOS zooms the page on focus.
          "text-base outline-none focus-visible:outline-none",
          overflowing
            ? "h-11 w-full rounded-md border border-destructive bg-background px-3 font-mono text-foreground shadow-xs"
            : "absolute inset-0 z-10 size-full bg-transparent text-transparent caret-transparent selection:bg-transparent",
        )}
        {...props}
      />

      {!overflowing && (
        <div aria-hidden className="pointer-events-none flex items-center">
          {GROUPS.map((group, g) => (
            <React.Fragment key={g}>
              {g > 0 && <span className="px-2 text-muted-foreground">–</span>}
              <div className="flex">
                {group.map((i) => (
                  <span
                    key={i}
                    data-slot="otp-cell"
                    data-index={i}
                    data-filled={i < value.length || undefined}
                    data-active={i === active || undefined}
                    className={cn(
                      "grid h-11 w-10 place-items-center border border-l-0 border-input bg-background text-base font-medium shadow-xs first:rounded-l-md first:border-l last:rounded-r-md",
                      invalid && "border-destructive",
                      // The active slot, marked only while the field really has focus.
                      i === active &&
                        "group-focus-within:relative group-focus-within:z-[1] group-focus-within:ring-2 group-focus-within:ring-ring",
                    )}
                  >
                    {value[i] ?? ""}
                    {/* The caret's stand-in, since the real one is transparent. */}
                    {i === active && i >= value.length && (
                      <span className="hidden h-5 w-px animate-pulse bg-foreground group-focus-within:block motion-reduce:animate-none" />
                    )}
                  </span>
                ))}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
