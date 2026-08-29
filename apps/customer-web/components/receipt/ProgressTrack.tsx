import type { OrderStage } from "@effy/shared-types"

import { RECEIPT_STATUS_TONES } from "@/app/checkout/_components/status-palette"
import { cn } from "@/lib/utils"

/**
 * The four customer-facing stages (052 FR-008).
 *
 * ⚠ THE ORDER OF THIS ARRAY IS THE JOURNEY, and it is the ONLY place the sequence is written on this
 * surface. The stage itself is SERVER-DERIVED (`OrderDTO.stage`) — this component decides where the
 * marker sits, never what the stage IS. A client that recomputed the stage from `fulfillments` would
 * be the second implementation of one rule, which is 029's banner target and 033's `available` flag.
 *
 * ⚠ It says nothing about HOW the order is fulfilled — no shop, no count, no node (FR-009).
 */
const STEPS: ReadonlyArray<{ stage: OrderStage; label: string; note: string }> = [
  { stage: "confirmed", label: "Confirmed", note: "We've received your payment" },
  { stage: "packing", label: "Being packed", note: "Your order is being picked" },
  { stage: "on_the_way", label: "On the way", note: "Out for delivery" },
  { stage: "delivered", label: "Delivered", note: "Your order has arrived" },
]

export function ProgressTrack({ stage, className }: { stage: OrderStage; className?: string }) {
  const current = Math.max(
    0,
    STEPS.findIndex((s) => s.stage === stage),
  )

  return (
    <ol className={cn("flex flex-col", className)} aria-label="Order progress">
      {STEPS.map((step, i) => {
        const done = i < current
        const isCurrent = i === current
        const last = i === STEPS.length - 1

        return (
          <li key={step.stage} className="grid grid-cols-[12px_minmax(0,1fr)] gap-x-3.5">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  done && RECEIPT_STATUS_TONES.paid.dot,
                  isCurrent && "border-2 border-foreground bg-background",
                  !done && !isCurrent && "border-2 border-muted-foreground/40 bg-background",
                )}
              />
              {/* The rail below a step. Filled only where the order has actually been. */}
              {!last ? (
                <span
                  aria-hidden="true"
                  className={cn("min-h-6 w-0.5 flex-1", done ? "bg-muted-foreground/40" : "bg-border")}
                />
              ) : null}
            </div>

            <div className={cn("flex flex-col gap-0.5", !last && "pb-4")}>
              <span
                className={cn(
                  "text-[13.5px]",
                  done || isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
                {/* The state is announced in WORDS, so the marker's colour is never load-bearing. */}
                {isCurrent ? <span className="sr-only"> — current step</span> : null}
                {done ? <span className="sr-only"> — completed</span> : null}
              </span>
              {isCurrent ? (
                <span className="text-[12.5px] text-muted-foreground">{step.note}</span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
