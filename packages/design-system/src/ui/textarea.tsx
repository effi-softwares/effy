import * as React from "react"

import { cn } from "../cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Matches `input.tsx`: the same border, padding, 6px corner and border-only focus.
        "border-input placeholder:text-placeholder focus-visible:border-ring aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--destructive)_10%,transparent)] flex field-sizing-content min-h-22 w-full rounded-md border bg-transparent px-3 py-2 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
