import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import type { ShopBacklogDTO } from "@effy/shared-types"
import { IconChip, Skeleton, Spinner } from "@effy/design-system/ui"

import { deltaText, money } from "@/features/insights/model"
import { insightsQuery } from "@/features/insights/queries"

import { unitsToPack } from "./model"

/**
 * "Today at a glance": reads `insightsQuery("today")`, the same entry Insights reads, so the two agree by
 * construction. "Awaiting pick" comes from the operational snapshot instead, because it is live work.
 * Four figures in one bordered strip. Each cell has an icon chip with the design's geometric glyphs
 * (◈ ◫ ◎ ▤, never emoji): money is brand, volume violet, average teal, and Awaiting pick the attention hue,
 * as the one cell that is work rather than a result.
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
