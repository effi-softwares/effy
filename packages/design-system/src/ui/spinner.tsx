import * as React from "react"

import { cn } from "../cn"

/**
 * The spinner: an 11px `--brand-mid` ring with a `--brand` top, turning every.9s. Use it for any
 * in-flight state rather than a text-only "Loading…". `data-effy-spinner` exempts it from the
 * reduced-motion flattening (it slows instead of freezing). `aria-hidden`: the region's `aria-busy` /
 * `aria-live` and the visible label announce.
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
