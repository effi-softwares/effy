import type { ComponentProps } from "react"

import { cn } from "@effy/design-system"
import { Input } from "@effy/design-system/ui"

/** A whole number with its unit after it ("min", "days", "¢"): the settings pages' one number control. */
export function UnitInput({
  unit,
  className,
  invalid,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & { unit: string; invalid?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Input
        inputMode="numeric"
        autoComplete="off"
        className={cn("w-24 text-right tabular-nums", className)}
        aria-invalid={invalid ? true : undefined}
        {...props}
      />
      <span className="w-12 text-sm text-muted-foreground">{unit}</span>
    </span>
  )
}

/** "" is no number (the server refuses it by name), never 0. */
export const toWhole = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s.trim()))

/** Every value is a whole number - Save stays off until they are. */
export const allWhole = (...values: string[]): boolean => values.every((v) => Number.isInteger(toWhole(v)))
