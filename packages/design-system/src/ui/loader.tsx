import type * as React from "react"

import { cn } from "../cn"

/**
 * The loader for large regions (a page, a table, a drawer body): an `--accent2` sun, a `--brand` planet
 * orbiting once a second and a moon orbiting it twice as fast (`--primary` at 30% light, `--muted-foreground`
 * dark). Decorative, so `--accent2` carries no meaning here. Regions use this rather than a skeleton,
 * which would draw a layout the data may not have. Flat discs, every size a ratio of 70px, and
 * `data-effy-loader` slows it under reduced motion instead of freezing it.
 */
function Loader({
  size = 64,
  className,
  style,
  ...props
}: React.ComponentProps<"span"> & { size?: number }) {
  const u = (n: number) => `${(n / 70) * size}px`
  return (
    <span
      data-slot="loader"
      data-effy-loader=""
      aria-hidden="true"
      style={{ width: size, height: size, ...style }}
      className={cn(
        "relative inline-block shrink-0 [animation:effy-spin_1s_linear_infinite]",
        className
      )}
      {...props}
    >
      <span
        className="bg-accent2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: u(16), height: u(16) }}
      />
      <span
        className="bg-primary absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
        style={{ width: u(12), height: u(12) }}
      />
      <span
        data-effy-loader-moon=""
        className="bg-primary/30 dark:bg-muted-foreground absolute inset-x-0 m-auto rounded-full [animation:effy-spin_0.5s_linear_infinite]"
        style={{
          width: u(8),
          height: u(8),
          bottom: u(16),
          transformOrigin: `50% calc(100% + ${u(10)})`,
        }}
      />
    </span>
  )
}

const AREA = {
  // A drawer's body: the sheet is narrow, the mark should not dominate it.
  sheet: { loader: 44, className: "min-h-40", gap: "gap-3", title: "text-sm", text: "text-xs" },
  // A table or a section: roughly the height of a short result set, so arrival does not jump.
  region: { loader: 56, className: "min-h-72", gap: "gap-4", title: "text-sm", text: "text-sm" },
  // A whole screen's content.
  page: {
    loader: 72,
    className: "min-h-[min(60vh,520px)]",
    gap: "gap-5",
    title: "text-base",
    text: "text-sm",
  },
} as const

/** A loading region: the Loader in space sized for what will replace it, with a title and one line that `role="status"` announces. */
function LoadingArea({
  variant = "region",
  title = "Loading",
  description,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  variant?: keyof typeof AREA
  title?: string
  description?: string
}) {
  const area = AREA[variant]
  return (
    <div
      data-slot="loading-area"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex w-full flex-col items-center justify-center px-4 text-center",
        area.className,
        area.gap,
        className
      )}
      {...props}
    >
      <Loader size={area.loader} />
      <div className="grid max-w-xs gap-1">
        <p className={cn("text-foreground font-medium", area.title)}>{title}</p>
        {description ? (
          <p className={cn("text-muted-foreground", area.text)}>{description}</p>
        ) : null}
      </div>
    </div>
  )
}

export { Loader, LoadingArea }
