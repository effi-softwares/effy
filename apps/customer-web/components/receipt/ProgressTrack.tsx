import { Check, House, Package, Truck } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { OrderStage } from "@effy/shared-types"

import { cn } from "@/lib/utils"

/**
 * The order's progress: four steps, the one it is at marked (reference: Orders · Order — on the way).
 *
 * The stage is the server's one word for the whole order. Nothing here reads packages, and nothing
 * here can show that an order was filled by more than one supplier.
 *
 * Every state is said as well as drawn: a finished step carries a tick and "completed", the current
 * one "current step" — a colour alone tells a screen reader, and a colour-blind customer, nothing.
 *
 * A row from the width of a phone up; a column in anything narrower (the checkout confirmation's side
 * panel) — decided by the space it is given, not the screen, so the same component fits both.
 */
const STEPS: ReadonlyArray<{ stage: OrderStage; label: string; note: string; icon: LucideIcon }> = [
  { stage: "confirmed", label: "Confirmed", note: "We've received your payment", icon: Check },
  { stage: "packing", label: "Being packed", note: "Your order is being picked", icon: Package },
  { stage: "on_the_way", label: "On the way", note: "Out for delivery", icon: Truck },
  { stage: "delivered", label: "Delivered", note: "Your order has arrived", icon: House },
]

export function ProgressTrack({ stage, className }: { stage: OrderStage; className?: string }) {
  const current = Math.max(
    0,
    STEPS.findIndex((s) => s.stage === stage),
  )
  // Delivered is the end of the line: its step is finished, not "in progress".
  const finished = stage === "delivered"

  return (
    <div className={cn("@container", className)}>
      <ol aria-label="Order progress" className="grid @md:grid-cols-4">
        {STEPS.map((step, i) => {
          const done = i < current || (finished && i === current)
          const isCurrent = i === current && !finished
          const reached = done || isCurrent
          const Icon = done ? Check : step.icon
          return (
            <li
              key={step.stage}
              className={cn(
                "relative flex items-start gap-3 pb-4 last:pb-0 @md:flex-col @md:items-center @md:gap-1.5 @md:px-1 @md:pb-0 @md:text-center",
                // The line arriving at this step: down the side in a column, along the top in a row.
                "before:absolute before:-top-4 before:left-[15px] before:h-4 before:w-0.5 first:before:hidden",
                "@md:before:top-[15px] @md:before:-left-1/2 @md:before:h-0.5 @md:before:w-full",
                reached ? "before:bg-brand" : "before:bg-border",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-[1] grid size-8 shrink-0 place-items-center rounded-full [&>svg]:size-4",
                  done && "bg-brand text-brand-foreground",
                  isCurrent && "bg-background text-brand shadow-[inset_0_0_0_2px_var(--brand)]",
                  !reached && "bg-muted text-muted-foreground",
                )}
              >
                <Icon />
              </span>
              <span>
                <span className={cn("block text-[13px]", reached ? "font-semibold" : "font-medium text-muted-foreground")}>
                  {step.label}
                  {isCurrent ? <span className="sr-only"> — current step</span> : null}
                  {done ? <span className="sr-only"> — completed</span> : null}
                </span>
                <span className="block text-xs text-muted-foreground">{step.note}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
