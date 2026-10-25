import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "../cn"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-6 rounded-full bg-background shadow-xs transition-transform dark:bg-[#fafafa] data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-1",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
