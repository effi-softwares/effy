import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The storefront's form controls (reference: shadcn · Forms).
 *
 * Field borders are a hairline by design (the identity's one recorded contrast deviation), so two
 * things are binding on every use: the field has a visible `<Label>`, and focus shows the blue ring
 * plus its halo. An error is a black border with a soft halo — there is no red — and must come with
 * words beside it.
 *
 * Text is 16px on phones so iOS does not zoom the page on focus, 14px from `md`.
 */
const control =
  "w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(control, "h-10 md:h-9", className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(control, "min-h-20 py-2", className)} {...props} />
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("text-sm leading-none font-medium", className)} {...props} />
}

/**
 * The reference Switch. A real `<button role="switch">`, so it needs no library and works wherever a
 * button does. Same props as shadcn's (`checked`, `onCheckedChange`) so call sites read the same.
 */
export function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "onChange"> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? "checked" : "unchecked"}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary-fill" : "bg-input",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background shadow-xs transition-transform",
          checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  )
}
