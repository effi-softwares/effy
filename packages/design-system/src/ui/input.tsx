import * as React from "react"

import { cn } from "../cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // ⚠ SQUARED, h-9, px-3 — REVERSING the tall pill this carried since 051, on the same
        // reasoning that put it there and the same reasoning that now takes it away: a field must
        // match the buttons beside it. The imported console design (057) is a squared 36px system —
        // its input is `height:36px; border-radius:6px; font-size:14px`, transcribed exactly — and a
        // 44px pill next to a 36px square button is the mismatch, now inverted.
        //
        // ⚠ `text-sm` UNCONDITIONALLY, not `text-base md:text-sm`. The old pair existed to stop iOS
        // Safari zooming on focus at <16px, which matters on a customer storefront opened on a phone.
        // This is an operator console on a bench tablet and a desktop; the mockup sets 14px flat, and
        // a field that changes size at a breakpoint is the kind of drift this whole pass is undoing.
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
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
