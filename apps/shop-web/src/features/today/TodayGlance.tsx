import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import type { ShopBacklogDTO } from "@effy/shared-types"
import { IconChip, Skeleton, Spinner } from "@effy/design-system/ui"

import { deltaText, money } from "@/features/insights/model"
import { insightsQuery } from "@/features/insights/queries"

import { unitsToPack } from "./model"

/**
 * "Today at a glance" — a summary, with the analysis one click away (058, FR-014).
 *
 * ⚠ IT READS `insightsQuery("today")` — THE SAME CACHE ENTRY INSIGHTS READS. That is what makes
 * "these two screens agree" true by construction rather than by coincidence: there is one request,
 * one answer, and both screens render it. Computing today's revenue here from the operational
 * snapshot would be a second implementation of the same question, which is the exact mistake 052
 * deleted (`summarizeFulfillment`) and 033 found in the availability flag.
 *
 * ⚠ AND THE FOURTH CELL COMES FROM THE OPERATIONAL SNAPSHOT, for the opposite reason. "Awaiting pick"
 * is live work: a minute-old figure sends someone to a shelf for an order already packed.
 *
 * ⚠ FOUR FIGURES IN ONE BORDERED STRIP, not four cards (Principle V's layout doctrine).
 *
 * ⚠ EACH CELL CARRIES AN ICON CHIP, which is the design's metric-tile device and the platform's
 * primary way of putting colour in the UI. The glyphs are the design's own geometric set
 * (◈ ◫ ◎ ▤) — never emoji, which render in the system palette, ignore `currentColor` and look
 * different on every operating system.
 *
 * ⚠ THE CHIP TONES ARE NOT DECORATIVE AND NOT ARBITRARY. Money is brand (the shop's core figure),
 * volume is violet and average is teal (the two data-viz hues, used here as tints rather than
 * series), and Awaiting pick is the ATTENTION hue — the one cell on this strip that is a piece of
 * work rather than a result. That is the whole reason --accent2 is reserved.
 */
export function TodayGlance({ backlog }: { backlog: ShopBacklogDTO | undefined }) {
  const insights = useQuery(insightsQuery("today"))
  const dto = insights.data

  const cells = [
    {
      tone: "brand" as const,
      glyph: "\u25c8", // ◈
      label: "Revenue today",
      value: dto ? money(dto.primary.revenue.value, dto.currency) : null,
      note: dto ? deltaText(dto.primary.revenue, dto.comparison.basis) : "",
    },
    {
      tone: "violet" as const,
      glyph: "\u25ab", // ▫
      label: "Orders today",
      value: dto ? dto.primary.orders.value : null,
      note: dto ? `${dto.primary.orders.lastHour ?? 0} in the last hour` : "",
    },
    {
      tone: "teal" as const,
      glyph: "\u25ce", // ◎
      label: "Average order value",
      value: dto ? money(dto.primary.averageOrderValue.value, dto.currency) : null,
      note: dto ? deltaText(dto.primary.averageOrderValue, dto.comparison.basis) : "",
    },
    {
      tone: "attention" as const,
      glyph: "\u25a4", // ▤
      label: "Awaiting pick",
      value: backlog ? String(backlog.awaitingPick.orders) : null,
      note: backlog ? unitsToPack(backlog.awaitingPick.units) : "",
    },
  ]

  return (
    <section className="overflow-hidden rounded-[var(--radius)] border">
      <header className="flex items-center gap-3 border-b px-[18px] py-[13px]">
        <h2 className="text-[13px] font-semibold">Today at a glance</h2>
        {insights.isFetching ? <Spinner /> : null}
        <div className="flex-1" />
        <Link
          to="/insights"
          className="text-muted-foreground hover:text-foreground text-[13px] font-medium no-underline"
        >
          Full insights →
        </Link>
      </header>
      {/* Rules as a grid gap — at two columns on a phone the second row would otherwise draw one
          against the card's left edge (see MetricStrip). */}
      <dl className="bg-border grid grid-cols-2 gap-px sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="bg-background grid min-w-0 gap-1 px-[18px] py-[15px]">
            <dt className="flex min-w-0 items-center gap-2">
              <IconChip tone={c.tone} size="sm">
                {c.glyph}
              </IconChip>
              <span className="truncate text-xs font-medium text-muted-foreground">{c.label}</span>
            </dt>
            <dd className="truncate text-[22px] font-semibold tracking-[-0.02em] tabular-nums">
              {c.value ?? <Skeleton className="h-6 w-16" />}
            </dd>
            <dd className="text-muted-foreground truncate text-[11.5px]">{c.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
