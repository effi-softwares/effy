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
        // ⚠ Now the SAME 6px as the input beside it. It took `rounded-xl` only because a multi-line
        // box cannot be a pill without the text colliding with the round ends — with the field family
        // squared, that exception has nothing left to solve.
        "border-input placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
