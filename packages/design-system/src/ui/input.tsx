import * as React from "react"

import { cn } from "../cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Squared, 44px, 15px text, matching the buttons beside it.
        "h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-[15px] text-foreground shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-placeholder disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // Focus is a border change plus a neutral 3px `--muted` ring (a coloured halo would read as
        // "selected"). `--ring` clears 3:1 on the ground, so the border alone suffices.
        "focus-visible:border-ring",
        "aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_color-mix(in_srgb,var(--destructive)_10%,transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
