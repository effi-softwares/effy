import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The shop console's small layout helpers, drawn in the back-office identity ("Effy Shop Console
 * Redesign", 2026-10-24). They are thin names over the shared pattern classes
 * (`@effy/design-system/backoffice/patterns.css`, sized for touch by `styles/touch.css`), kept so the
 * screens that already speak them did not each have to be rewritten to change how they look. New
 * screens use `@effy/web-kit/patterns` (PageHeader, Panel, DetailRows, StatusWord…) directly.
 *
 * The colour law holds: a tone never carries meaning alone. Every pill keeps its words — in progress →
 * blue · done → green · waiting → outline · problem → black with an icon · inert → grey.
 */

// Page scaffolding

/** A page: its sections stacked 24px apart (16 on a phone). */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-col gap-6 max-md:gap-4", className)}>{children}</div>
}

/**
 * A titled panel: flat, one hairline, a title with one muted line and its action on the right, then
 * the content. Never a metric tile.
 */
export function DetailSection({
  title,
  subtitle,
  action,
  children,
  className,
  flush = false,
}: {
  title: ReactNode
  subtitle: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  /** The body is a table or list that runs to the panel's edges. */
  flush?: boolean
}) {
  return (
    <section className={cn("bo-panel min-w-0", className)}>
      <div className="bo-panel__head">
        <div className="min-w-0 flex-1">
          <h2 className="bo-panel__title">{title}</h2>
          <p className="bo-panel__desc">{subtitle}</p>
        </div>
        {action}
      </div>
      {flush ? children : <div className="bo-panel__body">{children}</div>}
    </section>
  )
}

/** A responsive grid of fields inside a panel — auto-fit columns; `min` is the narrowest a column may get. */
export function FieldGrid({
  children,
  min = 210,
  className,
}: {
  children: ReactNode
  min?: number
  className?: string
}) {
  return (
    <div
      className={cn("grid gap-x-8 gap-y-5", className)}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  )
}

/**
 * One stacked field: a muted label above its value. `wide` spans every column and caps the value at a
 * readable measure; `size` picks the value scale — `body`, `figure` (counts) or `display` (money).
 */
export function Field({
  label,
  value,
  mono,
  wide,
  size = "body",
  emphasis,
}: {
  label: ReactNode
  value: ReactNode
  mono?: boolean
  wide?: boolean
  size?: "body" | "figure" | "display"
  emphasis?: boolean
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1", wide && "col-span-full")}>
      <MicroLabel className="whitespace-normal">{label}</MicroLabel>
      <div
        className={cn(
          size === "body" && "text-[15px] leading-[22px]",
          size === "figure" && "text-base font-semibold tabular-nums",
          size === "display" && "text-[22px] leading-7 font-semibold tracking-[-.02em] tabular-nums",
          wide && "max-w-[68ch]",
          mono && "font-mono",
          emphasis && "font-semibold",
        )}
      >
        {value}
      </div>
    </div>
  )
}

/** A panel's own action (`Edit`, `Manage`). `onClick` is required so a control that does nothing is a build error. */
export function SectionAction({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-slot="button"
      data-variant="ghost"
      data-size="sm"
      className="inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}

/** A field or column label: 13px, muted, sentence case. */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[13px] font-medium whitespace-nowrap text-muted-foreground", className)}>{children}</div>
  )
}

/** A label/value row in a narrow rail. */
export function RailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

// Pills

export type PillTone = "brand" | "success" | "warning" | "destructive" | "muted"

/** The five tones as status words. `quiet | strong | outline` are aliases. */
const PILL_CLASS: Record<PillTone, string> = {
  brand: "bo-st--moving",
  success: "bo-st--done",
  warning: "bo-st--waiting",
  destructive: "bo-st--problem",
  muted: "bo-st--muted",
}

const PILL_ALIAS: Record<string, PillTone | undefined> = {
  quiet: "muted",
  strong: "warning",
  outline: "warning",
}

export function Pill({
  children,
  variant = "quiet",
}: {
  children: ReactNode
  variant?: PillTone | "quiet" | "strong" | "outline"
}) {
  const tone = PILL_ALIAS[variant] ?? (variant as PillTone)
  return <span className={cn("bo-st", PILL_CLASS[tone])}>{children}</span>
}

// Tables

/** A table in its hairline frame, scrolling sideways only when it must. */
export function TableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bo-table-wrap", className)}>
      <div className="bo-table-scroll">
        <table className="bo-table">{children}</table>
      </div>
    </div>
  )
}

export function Th({
  children,
  align = "left",
  width,
}: {
  children?: ReactNode
  align?: "left" | "right"
  width?: string
}) {
  return (
    <th style={width ? { width } : undefined} className={cn(align === "right" && "is-num")}>
      {children}
    </th>
  )
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode
  align?: "left" | "right"
  className?: string
}) {
  return <td className={cn(align === "right" && "is-num", className)}>{children}</td>
}

/** A body row; `interactive` marks rows that open something. */
export function Tr({
  children,
  interactive,
  onClick,
}: {
  children: ReactNode
  interactive?: boolean
  onClick?: () => void
}) {
  return (
    <tr onClick={onClick} className={cn(interactive && "cursor-pointer")}>
      {children}
    </tr>
  )
}

// Segmented control

/** Two or three exclusive views of one thing (Table / Queue): a muted trough, the active one raised. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (next: T) => void
  options: readonly { value: T; label: ReactNode }[]
  ariaLabel: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="bo-seg">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(active && "is-active")}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** The dot between metadata items. */
export function MetaDivider() {
  return (
    <span aria-hidden="true" className="text-muted-foreground">
      ·
    </span>
  )
}
