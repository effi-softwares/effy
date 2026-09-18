import type * as React from "react"

import { cn } from "../cn"

/**
 * THE LOADER — the orbit mark for LARGE regions: a whole page, a table, a drawer's body.
 *
 * An `--accent2` (orange) sun at the centre, a `--brand` (blue) planet orbiting it once a second, and
 * a small moon orbiting the planet twice as fast (adapted from css-loaders.com "l17"). The moon is
 * `--brand-mid` (light blue) in light and `--muted-foreground` (grey) in dark, where `--brand-mid` is a
 * dim navy that all but disappears on the near-black ground.
 *
 * ⚠ `--accent2` is otherwise reserved for attention (dots, cut-off chips). Its use here is an operator
 * decision, bounded to this one decorative, non-interactive mark — it carries no meaning.
 *
 * ⚠ WHY NOT A SKELETON HERE. A shimmer is honest for a small thing whose shape is known — a line of
 * text, a figure. For a table or a page it draws a layout the data may not have (six rows for three
 * orders, a card where an empty state will land), and a screen of pulsing grey bars reads as broken.
 * Small things keep `Skeleton`; regions use this.
 *
 * ⚠ FLAT DISCS, NOT `radial-gradient`. The source loader paints its discs with gradients; the platform
 * rule is flat fills only, and three positioned `rounded-full` elements draw the same thing.
 *
 * ⚠ Every dimension is a ratio of the source's 70px geometry, so the mark scales without drifting —
 * the moon's pivot (`transform-origin`) must stay on the planet's centre at any size.
 *
 * ⚠ `data-effy-loader` exempts it from tokens.css's reduced-motion flattening (which would freeze it
 * mid-orbit) and slows it instead, exactly as `data-effy-spinner` does for the small spinner.
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
        className="bg-brand absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
        style={{ width: u(12), height: u(12) }}
      />
      <span
        data-effy-loader-moon=""
        className="bg-brand-mid dark:bg-muted-foreground absolute inset-x-0 m-auto rounded-full [animation:effy-spin_0.5s_linear_infinite]"
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
  sheet: { loader: 44, className: "min-h-40", gap: "gap-3", title: "text-[13px]", text: "text-xs" },
  // A table or a section: roughly the height of a short result set, so arrival does not jump.
  region: { loader: 56, className: "min-h-72", gap: "gap-4", title: "text-sm", text: "text-[13px]" },
  // A whole screen's content.
  page: {
    loader: 72,
    className: "min-h-[min(60vh,520px)]",
    gap: "gap-5",
    title: "text-[15px]",
    text: "text-[13px]",
  },
} as const

/**
 * A region that is loading: the Loader centred in space sized for what will replace it, with a short
 * title ("Loading orders") and one line saying what is being fetched. The text is what
 * `role="status"` announces; the mark itself is `aria-hidden`.
 */
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
