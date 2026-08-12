import * as React from "react"

import { cn } from "../cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        // ⚠ NO FOCUS HALO. shadcn's default is `ring-[3px] ring-ring/50`, a soft glow outside the
        // field; it is deliberately absent here (operator direction) and must not be reintroduced by
        // a call site. The focus indicator is the BORDER changing to `--ring` (#808080 light /
        // #737373 dark — 3.95:1 and 4.18:1 on their grounds, over WCAG 1.4.11's 3:1), which is what
        // keeps removing the halo a style change rather than an accessibility regression.
        "focus-visible:border-ring",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
