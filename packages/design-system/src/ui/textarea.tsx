import * as React from "react"

import { cn } from "../cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // ⚠ Matches `input.tsx`: same `--input` border, `px-4`, `bg`, no focus halo (the border alone
        // carries focus — the two fields MUST agree or a form mixing them shows two focus treatments).
        // The one difference is the corner: a multi-line box cannot be a full pill without the text
        // colliding with the round ends, so it takes `rounded-xl` — the pill family's radius, read at
        // a rectangle. `py-3`/`min-h-20` give it breathing room a single-line pill doesn't need.
        "border-input placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-20 w-full rounded-xl border bg-transparent px-4 py-3 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
