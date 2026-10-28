import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { CheckIcon } from "lucide-react"

import { cn } from "../cn"

// shadcn's checkbox, one step larger (20px), filled with the action blue when checked; `touch-hit` gives it a
// 44px tap area on a touch screen.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer touch-hit border-input dark:bg-input/30 data-[state=checked]:bg-primary-fill data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary-fill data-[state=checked]:border-primary focus-visible:border-ring aria-invalid:border-destructive size-5 shrink-0 rounded-[5px] border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
