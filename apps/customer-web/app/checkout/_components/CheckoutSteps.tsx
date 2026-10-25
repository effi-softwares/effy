"use client"

import { usePathname } from "next/navigation"
import { Check } from "lucide-react"

import { useCheckoutStep } from "@/lib/checkout-step"

const STEPS = ["Delivery", "Payment", "Done"] as const

/** The header's 1 · 2 · 3 (reference: Shared components · Checkout header). The confirmation page is step 3 by its address. */
export function CheckoutSteps() {
  const stored = useCheckoutStep()
  const step = usePathname().startsWith("/checkout/complete") ? 3 : stored
  return (
    <ol aria-label="Checkout steps" className="flex items-center gap-3 text-sm max-sm:gap-2">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < step
        const here = n === step
        return (
          <li key={label} aria-current={here ? "step" : undefined} className="flex items-center gap-3 max-sm:gap-2">
            {i > 0 && <span aria-hidden="true" className="h-px w-6 bg-border max-sm:w-3" />}
            <span
              className={`grid size-6 place-items-center rounded-full border text-xs font-medium ${
                here ? "border-foreground bg-foreground text-background" : done ? "border-brand bg-brand-fill text-brand-foreground" : "text-muted-foreground"
              }`}
            >
              {done ? <Check aria-hidden="true" className="size-4" /> : n}
            </span>
            <span className={`${here ? "font-medium" : "text-muted-foreground"} max-sm:sr-only`}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
