import * as React from "react"

import { cn } from "../cn"

/**
 * THE SPINNER (theme-adoption-prompt.md, Phase 2 §11).
 *
 * An 11px circle: a 1.6px `--brand-mid` ring with a `--brand` top border, turning once every .9s.
 *
 * ⚠ USE IT FOR ANY LIVE OR IN-FLIGHT STATE — NEVER A TEXT-ONLY "Loading…". A sentence does not read
 * as motion, so a stalled request and a finished one look identical; the turning ring is the only
 * thing on the page that distinguishes "still working" from "nothing happened".
 *
 * ⚠ `data-effy-spinner` is not decorative. tokens.css's `prefers-reduced-motion` block flattens every
 * animation on the platform to ~0ms, which would freeze this into a static broken circle — the
 * attribute is what exempts it, slowing it to 1.8s instead of stopping it. Removing the attribute
 * silently costs the one affordance that reduced-motion users still need.
 *
 * ⚠ It is `aria-hidden`: a spinner announces nothing useful to a screen reader. The region it sits in
 * carries `aria-busy` / `aria-live` and the visible label does the announcing.
 */
function Spinner({
  className,
  size = 11,
  ...props
}: React.ComponentProps<"span"> & { size?: number }) {
  return (
    <span
      data-slot="spinner"
      data-effy-spinner=""
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        "inline-block shrink-0 rounded-full border-[1.6px] border-brand-mid border-t-brand [animation:effy-spin_0.9s_linear_infinite]",
        className
      )}
      {...props}
    />
  )
}

export { Spinner }
