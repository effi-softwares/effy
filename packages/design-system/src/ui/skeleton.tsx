import type * as React from "react"

import { cn } from "../cn"

// Uses tokens.css's `effy-pulse` rather than `animate-pulse`, so it shares one timing and the reduced-motion rule.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md bg-muted [animation:effy-pulse_1.6s_ease-in-out_infinite]", className)}
      {...props}
    />
  )
}

export { Skeleton }
