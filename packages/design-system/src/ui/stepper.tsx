/**
 * Stepper — the progress rail for a multi-step wizard.
 *
 * The one component in 057's imported design vocabulary that the shared package did not already
 * cover. The other three the plan expected to be missing were already here: {@link ResponsiveModal}
 * is the responsive sheet (dialog on desktop, bottom drawer on mobile), `sonner` is the toast, and
 * {@link Tabs} is the segmented control. Only this was absent.
 *
 * ⚠ IT IS A STATUS DISPLAY, NOT A NAVIGATION CONTROL, unless `onStepSelect` is supplied. A wizard
 * whose rail is always clickable invites a jump into step 4 over a step-2 form that has not
 * validated. The caller decides which steps are reachable by passing `maxReachableStep`.
 *
 * ⚠ COMPLETION IS CARRIED BY A GLYPH AND WEIGHT, NEVER BY COLOUR ALONE (Principle V). The ramp does
 * the work: a completed step gets a ✓ on the accent fill, the current step gets the accent fill and a
 * semibold label, future steps sit muted with a hairline ring. Rendered in greyscale it still reads.
 */
import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "../cn"

export interface StepperProps extends React.ComponentProps<"nav"> {
  steps: readonly string[]
  /** Zero-based index of the step being shown. */
  current: number
  /**
   * Highest step index the user may jump to. Steps beyond it are inert even when `onStepSelect` is
   * supplied. Defaults to `current` — i.e. you may go back, never forward.
   */
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
