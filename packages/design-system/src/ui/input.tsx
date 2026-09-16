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
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-placeholder disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        // ⚠ FOCUS IS A BORDER CHANGE PLUS A 3px `--muted` RING (adoption prompt, Phase 2 §2). The
        // ring is a NEUTRAL tint, not a tinted glow of the ring colour — on a cobalt-accented form
        // a coloured halo reads as "this field is selected/active" rather than "this field has
        // keyboard focus", which is a different statement. `--ring` itself is tuned to clear WCAG
        // 1.4.11's 3:1 against the ground (3.07:1 light / 3.14:1 dark) so the border alone is a
        // sufficient indicator where the ring is not rendered.
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-muted",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
