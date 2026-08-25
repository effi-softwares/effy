"use client"

import { cn } from "@/lib/utils"

/**
 * The field shell the card inputs sit inside (051 T033).
 *
 * ⚠ WHY THIS EXISTS RATHER THAN A PAYMENT ELEMENT. The provider's own card form has a fixed layout —
 * its label positions, field grouping and row order are its own — so styling it can only ever produce a
 * resemblance to Effy, not the thing itself (FR-028, research R7). Mounting the three PCI-scoped inputs
 * into OUR shell means the label, the pill, the focus treatment, the error copy and the spacing are all
 * ordinary Effy markup, and the provider owns exactly the three boxes it must.
 *
 * ⚠ THE CLASSES BELOW ARE COPIED FROM `packages/design-system/src/ui/input.tsx` ON PURPOSE, not
 * approximated. h-11, `rounded-full`, `px-4`, `border-input` — the platform's ONE input shape. A field
 * on the payment step that is 2px shorter than a field on the address form is exactly the kind of drift
 * that makes a page feel bought-in rather than built.
 *
 * ⚠ NO FOCUS HALO. `input.tsx` records the decision in full: shadcn's default is a soft ring outside the
 * field; the platform's focus indicator is the BORDER changing to `--ring` (3.95:1 light / 4.18:1 dark,
 * over WCAG 1.4.11's 3:1). Removing the halo is a style change, not an accessibility regression — and
 * re-introducing one here would make this the only field on the platform that glows.
 */
export function Field({
  label,
  htmlFor,
  children,
  error,
  hint,
  className,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  /** A message the shopper can act on. Renders the field in the error state (FR-036). */
  error?: string | null
  hint?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[13px] font-medium text-foreground"
      >
        {label}
      </label>
      <div
        className={cn(
          // Mirrors the shared Input: pill, h-11, hairline border, 16px gutter.
          "flex h-11 w-full min-w-0 items-center gap-2 rounded-full border bg-transparent px-4",
          "transition-[color,box-shadow] dark:bg-input/30",
          // The focus indicator is the border, and only the border.
          error ? "border-destructive" : "border-input focus-within:border-ring",
        )}
      >
        {children}
      </div>
      {error ? (
        // ⚠ `role="alert"` so a shopper using a screen reader hears the refusal rather than tabbing past
        // it. A decline they cannot perceive is indistinguishable from the form doing nothing (FR-034).
        <p role="alert" className="mt-1.5 text-[13px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
