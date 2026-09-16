import type { ShopBacklogDTO, ShopInsightsDTO } from "@effy/shared-types"
import { IconChip } from "@effy/design-system/ui"

import { deltaText, deltaToneClass, metricLabel, money, RANGE_SUFFIX } from "./model"

/**
 * The design's five KPI chips, in its own order and its own geometric glyphs: ◈ brand, ◫ violet,
 * ◎ teal, ◐ warning, ▤ attention.
 *
 * ⚠ THE LAST TWO ARE NOT DECORATIVE. Cells 4 and 5 ("Awaiting pick", "Unfulfilled units") are the
 * only LIVE operational figures on an analytics screen — work, not results — and the warning and
 * attention tints are what separate them at a glance from the three money figures beside them.
 *
 * ⚠ NEVER EMOJI. These glyphs inherit `currentColor` and render identically everywhere; an emoji
 * would arrive in the operating system's own palette and ignore the theme entirely.
 */
const CHIPS = [
  { glyph: "\u25c8", tone: "brand" },
  { glyph: "\u25eb", tone: "violet" },
  { glyph: "\u25ce", tone: "teal" },
  { glyph: "\u25d0", tone: "warning" },
  { glyph: "\u25a4", tone: "attention" },
] as const

/**
 * The primary metric strip (058, US3).
 *
 * ⚠ ONE BORDERED CONTAINER DIVIDED BY RULES, NOT FIVE TILES. The constitution's layout doctrine is
 * against metric cards, and this is the treatment 057's `CountStrip` already uses: a single strip
 * whose cells are separated by hairlines reads as one statement about the shop rather than five
 * competing boxes.
 *
 * ⚠ THE LAST TWO CELLS COME FROM `todayQuery`, NOT FROM THIS PAYLOAD. "Awaiting pick" and
 * "Unfulfilled units" are LIVE operational figures; reading them from the analytics payload would
 * make them minutes old and let this screen disagree with Today about work in progress (FR-006).
 */
export function MetricStrip({
  dto,
  backlog,
}: {
  dto: ShopInsightsDTO
  backlog: ShopBacklogDTO | undefined
}) {
  const cells = [
    {
      label: metricLabel("Revenue", dto.range),
      value: money(dto.primary.revenue.value, dto.currency),
      note: deltaText(dto.primary.revenue, dto.comparison.basis),
      tone: deltaToneClass(dto.primary.revenue),
    },
    {
      label: metricLabel("Orders", dto.range),
      value: dto.primary.orders.value,
      note:
        dto.range === "today"
          ? `${dto.primary.orders.lastHour ?? 0} in the last hour`
          : `${dto.primary.orders.perDay ?? "0"} per day on average`,
    },
    {
      label: "Average order value",
      value: money(dto.primary.averageOrderValue.value, dto.currency),
      note: deltaText(dto.primary.averageOrderValue, dto.comparison.basis),
      tone: deltaToneClass(dto.primary.averageOrderValue),
    },
    {
      label: "Awaiting pick",
      value: backlog ? String(backlog.awaitingPick.orders) : "—",
      note: backlog?.awaitingPick.oldestPaidAt ? "Oldest still waiting" : "Nothing waiting",
    },
    {
      label: "Unfulfilled units",
      value: backlog ? String(backlog.awaitingPick.units) : "—",
      note: backlog ? `Across ${backlog.awaitingPick.orders} orders` : "",
    },
  ]

  // ⚠ The rules are a 1px GRID GAP over the border colour, not per-cell left borders. At three
  // breakpoints the cells wrap, and `border-l` + `first:border-l-0` leaves the leftmost cell of every
  // wrapped row drawing a rule against the container's own edge — the dangling rule the brief warns
  // about. A gap draws only between cells, at every width, with no nth-child arithmetic.
  return (
    <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border min-[1240px]:grid-cols-5 sm:grid-cols-3">
      {cells.map((c, i) => {
        const chip = CHIPS[i] ?? CHIPS[0]
        return (
          <div key={c.label} className="bg-background grid gap-[5px] px-[18px] py-4">
            <dt className="flex min-w-0 items-center gap-2">
              <IconChip tone={chip.tone} size="lg">
                {chip.glyph}
              </IconChip>
              <span className="truncate text-[12.5px] font-medium text-muted-foreground">
                {c.label}
              </span>
            </dt>
            <dd className="truncate text-[25px] font-semibold tracking-[-0.02em] tabular-nums">
              {c.value}
            </dd>
            {/* ⚠ The glyph still carries the direction (deltaText writes ▲/▼), so the colour is
                never the only thing saying a figure went down. */}
            <dd className={`truncate text-xs ${"tone" in c && c.tone ? c.tone : "text-muted-foreground"}`}>
              {c.note}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/** The window suffix, exported for the tests that pin the label wording. */
export { RANGE_SUFFIX }
