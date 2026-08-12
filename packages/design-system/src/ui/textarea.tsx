import * as React from "react"

import { cn } from "../cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // No focus halo — the border alone carries focus. See the note in `input.tsx`; the two
        // fields must agree or a form mixing them shows two different focus treatments.
        "border-input placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
