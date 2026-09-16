import type * as React from "react"

import { cn } from "../cn"

// ⚠ Uses the shared `effy-pulse` keyframe from tokens.css rather than Tailwind's `animate-pulse`, so
// every in-flight affordance on the platform breathes on ONE timing, and so the reduced-motion rule in
// tokens.css can stop it. Tailwind's own utility is outside that rule's reach.
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
