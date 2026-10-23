/**
 * The progress rail for a multi-step wizard. A status display unless `onStepSelect` is given, and then
 * only up to `maxReachableStep`. Completion shows by glyph and weight, not colour alone: ✓ on the
 * accent fill when done, the accent fill and a semibold label when current, muted with a hairline ring
 * when ahead.
 */
import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "../cn"

export interface StepperProps extends React.ComponentProps<"nav"> {
  steps: readonly string[]
  /** Zero-based index of the step being shown. */
  current: number
  /** The highest step the user may jump to; defaults to `current` (back, never forward). */
  maxReachableStep?: number
  onStepSelect?: (index: number) => void
}

export function Stepper({
  steps,
  current,
  maxReachableStep,
  onStepSelect,
  className,
  ...props
}: StepperProps) {
  const reachable = maxReachableStep ?? current

  return (
    <nav
      aria-label="Progress"
      data-slot="stepper"
      className={cn("flex w-full items-center gap-1", className)}
      {...props}
    >
      <ol className="flex w-full items-center gap-1">
        {steps.map((label, i) => {
          const done = i < current
          const active = i === current
          const selectable = Boolean(onStepSelect) && i <= reachable && !active
          const Marker = selectable ? "button" : "div"

          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-1">
              <Marker
                {...(selectable
                  ? { type: "button" as const, onClick: () => onStepSelect?.(i) }
                  : {})}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left",
                  "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selectable && "hover:bg-accent cursor-pointer",
                  !selectable && "cursor-default",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums transition-colors",
                    done && "bg-primary text-primary-foreground",
                    active && "bg-primary text-primary-foreground font-semibold",
                    !done && !active && "text-muted-foreground ring-border ring-1 ring-inset",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate text-sm",
                    active ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {/* The screen-reader half of the same fact the glyph carries visually. */}
                <span className="sr-only">
                  {done ? " (completed)" : active ? " (current step)" : " (not started)"}
                </span>
              </Marker>
              {i < steps.length - 1 ? (
                <span aria-hidden="true" className="bg-border h-px w-4 shrink-0 sm:w-6" />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
