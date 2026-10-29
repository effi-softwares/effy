import type * as React from "react"

import { cn } from "../cn"

// Uses skeleton.css's `effy-pulse` rather than `animate-pulse`, so it shares one timing and the reduced-motion rule.
// Screens draw `@effy/web-kit/patterns` Skeletons (built from this look) rather than this slab.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md bg-muted [animation:effy-pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]", className)}
      {...props}
    />
  )
}

export { Skeleton }
