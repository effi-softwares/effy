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
 * ⚠ AND THEY ARE THE PLACE THE COLOUR LAW IS ENFORCED. Under the monochrome constitution that meant
 * REFUSING the design's `TONES` map: its amber was a third UI hue, and its `--success` under text
 * measured 4.00:1. Both objections were real, and both are now GONE — the platform-wide theme
 * adoption brings a `--warning` token and re-tunes `--success` to #0d8043, which clears 4.5:1 on
 * white AND on its own tint. So the design's five tones are adopted as authored.
 *
 * ⚠ WHAT DID NOT CHANGE: a tone never carries meaning ALONE. Every pill still keeps its words, so the
 * console survives greyscale, a colour-blind operator, and a shop floor in bright light. The hue is
 * how you find the row at a glance; the word is how you know what it says.
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

/**
 * An open, card-free page section (057 product-detail revision): a bold title, a one-line muted
 * subtitle saying what the section IS, its action right-aligned on the same row — then ONE hairline,
 * then the content.
 *
 * ⚠ DISTINCT FROM `Section`, NOT A REPLACEMENT. `Section` draws a row-list whose every row carries its
 * own bottom border; the product screen dropped those per-row rules because a divider under every
 * field reads as noise once fields sit in a grid. Order detail still wants the row-list, so the two
 * shapes live side by side rather than one prop flipping the other's semantics.
 */
export function DetailSection({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: ReactNode
  subtitle: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("grid min-w-0", className)}>
      <div className="border-border flex items-start justify-between gap-4 border-b pb-[11px]">
        <div className="grid min-w-0 gap-[3px]">
          <h2 className="text-sm font-semibold tracking-[-.01em]">{title}</h2>
          <p className="text-muted-foreground text-[12.5px] leading-[1.5]">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * The responsive field grid under a `DetailSection` — auto-fit columns, so the content fills the page
 * width instead of hugging a narrow measure. `min` is the narrowest a column may get.
 */
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
      className={cn("grid gap-x-8 gap-y-[18px] pt-[18px]", className)}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  )
}

/**
 * One stacked field: an uppercase micro-label above its value. `wide` spans every column and caps the
 * value at a readable measure (descriptions); `size` picks the value scale — `body` for prose,
 * `figure` for counts (15px), `display` for money (19px).
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
    <div className={cn("grid min-w-0 content-start gap-[5px]", wide && "col-span-full")}>
      <MicroLabel className="whitespace-normal">{label}</MicroLabel>
      <div
        className={cn(
          size === "body" && "text-[13.5px] leading-[1.55]",
          size === "figure" && "text-[15px] font-semibold tracking-[-.01em] tabular-nums",
          size === "display" && "text-[19px] font-semibold tracking-[-.02em] tabular-nums",
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

/**
 * The section-header action: `Edit`, `Manage`, `See all`.
 *
 * ⚠ `onClick` IS REQUIRED, AND THAT IS A FIX. The product screen shipped
 * `<SectionAction>Manage</SectionAction>` on its Media section with no handler at all — a control
 * that looks live, takes keyboard focus, and does nothing when clicked. Nothing failed: a missing
 * optional prop is not a type error and no DOM assertion looks for a handler. Making it required
 * turns the next one into a build error instead of something an operator discovers by clicking.
 */
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
 * A status pill — the design's five tones, in the platform's tokens.
 *
 * ⚠ THE OLD `quiet | strong | outline` VARIANTS ARE KEPT AS ALIASES rather than removed. They were
 * the monochrome era's weight-based vocabulary; every call site that still asks for `strong` means
 * "this needs a human", which is now `warning`. Deleting the names would have been a rename across
 * screens for no visual gain, and would have lost the mapping that says what they used to mean.
 */
export function Pill({
  children,
  variant = "quiet",
}: {
  children: ReactNode
  variant?: PillTone | "quiet" | "strong" | "outline"
}) {
  const tone = PILL_ALIAS[variant] ?? (variant as PillTone)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap",
        PILL_TONE[tone],
      )}
    >
      {children}
    </span>
  )
}

export type PillTone = "brand" | "success" | "warning" | "destructive" | "muted"

/** The closed mapping. A sixth entry is how a palette becomes decoration — see `badge.tsx`. */
const PILL_TONE: Record<PillTone, string> = {
  brand: "border-brand-mid bg-brand-soft text-brand-ink",
  success: "border-border bg-success-soft text-success",
  warning: "border-border bg-warning-soft text-warning",
  destructive: "border-border bg-destructive-soft text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
}

const PILL_ALIAS: Record<string, PillTone | undefined> = {
  quiet: "muted",
  strong: "warning",
  outline: "muted",
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
 * The design's inventory bar — red at zero, amber when low, muted otherwise. The platform can now
 * express all three, so it does.
 *
 * ⚠ THE LABEL BESIDE IT STILL CARRIES THE MEANING IN WORDS. The colour is the glance; the words are
 * the statement. That was 041's remedy for a monochrome platform and it remains correct for a
 * coloured one, because a bar is a non-text indicator and cannot be read by a screen reader.
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
  // ⚠ EMPTY IS A DIFFERENT STATEMENT FROM LOW, and the design separates them: an empty shelf cannot
  // be sold from at all (destructive), a low one still can (warning). Collapsing both into "urgent"
  // is what the monochrome version had to do, and it cost the operator the one distinction that
  // decides whether to reorder today or this week.
  const empty = onHand <= 0
  return (
    <div className="flex items-center justify-end gap-2.5">
      <div className="h-[5px] w-14 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            empty ? "bg-destructive" : urgent ? "bg-warning" : "bg-muted-foreground",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={cn(
          "w-[62px] text-right text-[13px] tabular-nums",
          empty
            ? "text-destructive font-semibold"
            : urgent
              ? "text-warning font-semibold"
              : "text-muted-foreground",
        )}
      >
        {label}
      </div>
    </div>
  )
}

// ── Segmented control ───────────────────────────────────────────────────────────────────────────

/**
 * The design's segmented control: a 3px-padded `--muted` trough with a SOLID `--brand` active segment.
 *
 * ⚠ It matches `Tabs` in the design system exactly, on purpose. This one exists because the catalog's
 * filter strip is a plain controlled value rather than a Radix tab set with panels; if the two ever
 * LOOK different, the console has two segmented controls and the operator has to learn both.
 */
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
                ? "bg-brand text-primary-foreground font-semibold"
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

/** The 1px × 12px rule the mockup puts between metadata items. */
export function MetaDivider() {
  return <span aria-hidden="true" className="bg-border h-3 w-px shrink-0" />
}
