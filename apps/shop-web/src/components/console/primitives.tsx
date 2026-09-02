import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The shop console's layout vocabulary, transcribed from the imported Claude Design mockup
 * ("Effy Shop Console.dc.html", project 951bb710).
 *
 * ⚠ WHY THESE EXIST RATHER THAN INLINE CLASSES PER SCREEN. The mockup expresses its design as exact
 * pixel values repeated on every screen — `padding:9px 14px` on a `th`, `font-size:13.5px` on a `td`,
 * `padding:11px 0;border-bottom` on a detail row. Copied by hand into six screens those numbers drift
 * within a week, and the drift is invisible in review because every individual value looks plausible.
 * Named once, a change is one edit and a divergence is a diff.
 *
 * ⚠ AND THEY ARE THE PLACE THE COLOUR LAW IS ENFORCED. The mockup's `TONES` map is:
 *
 *     warn: amber           pos: --success as TEXT      neg: --destructive on --destructive-soft
 *
 * None of the first two survives contact with this platform. Amber is a third UI hue, which
 * Principle V permits in exactly two places and a status pill is neither (041 already stripped amber
 * out of these very screens). `--success` is 4.00:1 — above the 3:1 non-text bar, BELOW the 4.5:1 text
 * bar — which is precisely why it has no `-foreground` pair and why writing words on it is forbidden.
 * So every pill here is monochrome and separates its states by WEIGHT and BORDER. Rendered in
 * greyscale the console loses nothing, which is the actual requirement on a shop floor in bright light.
 */

// ── Page scaffolding ────────────────────────────────────────────────────────────────────────────

/** The mockup's `main`: one grid, `gap: var(--pad)`, content aligned to the top. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid content-start gap-[var(--pad)]", className)}>{children}</div>
}

/**
 * A section: a hairline-underlined header with an optional right-aligned action, then rows.
 *
 * ⚠ The action is a TEXT button, never a bordered one. The mockup uses a bare muted-foreground link
 * that darkens on hover, so a page of six sections does not read as a page of twelve buttons.
 */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("grid gap-0", className)}>
      <div className="border-border flex items-baseline justify-between gap-3 border-b pb-2.5">
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The section-header action: `Edit`, `Manage`, `See all`. */
export function SectionAction({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-pointer rounded-sm bg-transparent p-0 text-[13px] font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}

/** An uppercase micro-label — the mockup's `11.5px / 500 / .04em` rail and column heading. */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "text-muted-foreground text-[11.5px] font-medium tracking-[.04em] whitespace-nowrap uppercase",
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── Detail rows ─────────────────────────────────────────────────────────────────────────────────

/**
 * One label/value row: label left and muted, value right-aligned.
 *
 * ⚠ `mono` exists because SKUs, references and ids are compared character by character. The mockup
 * sets Geist Mono on exactly those values and nothing else.
 */
export function DetailRow({
  label,
  value,
  mono,
  emphasis,
}: {
  label: ReactNode
  value: ReactNode
  mono?: boolean
  emphasis?: boolean
}) {
  return (
    <div className="border-border flex items-baseline justify-between gap-5 border-b py-[11px]">
      <div className="text-muted-foreground shrink-0 text-[13px]">{label}</div>
      <div
        className={cn(
          "max-w-[52ch] text-right text-[13.5px] leading-[1.55]",
          mono && "font-mono",
          emphasis && "font-semibold",
        )}
      >
        {value}
      </div>
    </div>
  )
}

/** A right-rail row: a top hairline instead of a bottom one, so the rail reads as a list not a table. */
export function RailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="border-border flex items-baseline justify-between border-t py-2.5">
      <span className="text-muted-foreground text-[13px]">{label}</span>
      <span className="text-[13.5px] font-medium tabular-nums">{value}</span>
    </div>
  )
}

/**
 * The mockup's stat cell — a micro-label over a 16px semibold figure.
 *
 * ⚠ NOT A CARD. Principle V / DOCTRINE-2 bans metric cards on operational screens, and the mockup
 * agrees: its pricing block is a bare grid of these, separated by one hairline underneath.
 */
export function StatCell({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5">
      <MicroLabel>{label}</MicroLabel>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}

// ── Pills ───────────────────────────────────────────────────────────────────────────────────────

/**
 * A status pill.
 *
 * ⚠ MONOCHROME, AND THE VARIANTS DIFFER BY WEIGHT AND FILL — never by hue. `strong` is the state that
 * needs a human; `quiet` needs nothing today. This replaces the mockup's `TONES` map wholesale (see
 * this file's header for why its amber and its text-on-success are both unusable here).
 */
export function Pill({
  children,
  variant = "quiet",
}: {
  children: ReactNode
  variant?: "quiet" | "strong" | "outline"
}) {
  return (
    <span
      className={cn(
        "border-border inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] whitespace-nowrap",
        variant === "quiet" && "bg-muted text-muted-foreground font-medium",
        variant === "strong" && "bg-foreground text-background font-semibold",
        variant === "outline" && "text-foreground font-medium",
      )}
    >
      {children}
    </span>
  )
}

// ── Tables ──────────────────────────────────────────────────────────────────────────────────────

/** The mockup's table shell: one hairline border, rounded, horizontally scrollable. */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="border-border overflow-x-auto rounded-[var(--radius)] border">
      <table className="w-full border-collapse">{children}</table>
    </div>
  )
}

/** ⚠ The header row sits on `--muted`, which is what separates it from the body without a border. */
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
    <th
      style={width ? { width } : undefined}
      className={cn(
        "text-muted-foreground px-3.5 py-2.5 text-[11.5px] font-medium tracking-[.04em] whitespace-nowrap uppercase",
        align === "right" ? "text-right" : "text-left",
      )}
    >
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
  return (
    <td
      className={cn(
        "px-3.5 py-2.5 text-[13.5px]",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  )
}

/** A body row. `interactive` adds the mockup's hover fill for rows that navigate. */
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
    <tr
      onClick={onClick}
      className={cn(
        "border-border border-t",
        interactive && "hover:bg-accent cursor-pointer transition-colors",
      )}
    >
      {children}
    </tr>
  )
}

// ── Stock meter ─────────────────────────────────────────────────────────────────────────────────

/**
 * The mockup's inventory bar.
 *
 * ⚠ THE MOCKUP COLOURS THIS BAR — red at zero, amber when low, muted otherwise. Ours cannot: that is
 * three hues where the platform permits none. The fill is always the foreground ramp and the LABEL
 * beside it carries the meaning in words and weight, which is 041's remedy and the only version that
 * survives greyscale.
 *
 * ⚠ `max` guards a division by zero: a product with no threshold has no scale to draw against, so the
 * bar renders empty rather than full.
 */
export function StockMeter({
  onHand,
  max,
  label,
  urgent,
}: {
  onHand: number
  max: number
  label: ReactNode
  urgent?: boolean
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (onHand / max) * 100)) : 0
  return (
    <div className="flex items-center justify-end gap-2.5">
      <div className="bg-muted h-[5px] w-14 overflow-hidden rounded-full">
        <div
          className={cn("h-full", urgent ? "bg-foreground" : "bg-muted-foreground")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={cn(
          "w-[62px] text-right text-[13px] tabular-nums",
          urgent ? "text-foreground font-semibold" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
    </div>
  )
}

// ── Segmented control ───────────────────────────────────────────────────────────────────────────

/** The mockup's tab strip: a `--muted` trough with a raised active pill. */
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
    <div role="tablist" aria-label={ariaLabel} className="bg-muted flex flex-wrap gap-0.5 rounded-lg p-[3px]">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "focus-visible:ring-ring h-7 cursor-pointer rounded-md border-none px-[11px] text-[13px] focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground bg-transparent font-normal",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Breadcrumb ──────────────────────────────────────────────────────────────────────────────────

export function Crumbs({ parent, onParent, current }: { parent: string; onParent: () => void; current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-2 text-[13px]">
      <button
        type="button"
        onClick={onParent}
        className="hover:text-foreground focus-visible:ring-ring cursor-pointer rounded-sm bg-transparent p-0 text-[13px] focus-visible:ring-2 focus-visible:outline-none"
      >
        {parent}
      </button>
      <span aria-hidden="true">/</span>
      <span className="text-foreground min-w-0 truncate">{current}</span>
    </nav>
  )
}

/** The 1px × 12px rule the mockup puts between metadata items. */
export function MetaDivider() {
  return <span aria-hidden="true" className="bg-border h-3 w-px shrink-0" />
}
