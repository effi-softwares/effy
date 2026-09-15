import type {
  ComparisonBasis,
  InsightsFigureDTO,
  InsightsRange,
  ShopInsightsDTO,
} from "@effy/shared-types"

/**
 * Insights' copy (058, US3).
 *
 * ⚠ THE CLIENT FORMATS; IT NEVER SUBTRACTS (FR-024). Every comparison arrives computed, with the
 * basis it was computed against, so these functions turn `{ kind: "pct", amount: "9.0" }` into
 * "+9% vs previous week" and nothing more. The moment this file starts doing arithmetic on two
 * figures, the screen has a second opinion about the shop's revenue.
 */

export const RANGE_TITLE: Record<InsightsRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
}

/** "today" / "last 7 days" / "last 30 days" — a real PERIOD label, never the chart's bucket label. */
export const RANGE_PERIOD: Record<InsightsRange, string> = {
  today: "today",
  "7d": "last 7 days",
  "30d": "last 30 days",
}

/** What a metric label says about its own window: "Revenue, 7 days". */
export const RANGE_SUFFIX: Record<InsightsRange, string> = {
  today: "today",
  "7d": "7 days",
  "30d": "30 days",
}

/** The bucket a chart is drawn in — "By hour" / "By day" / "By week". */
export const GRAIN_LABEL: Record<"hour" | "day" | "week", string> = {
  hour: "By hour",
  day: "By day",
  week: "By week",
}

const BASIS_LABEL: Record<ComparisonBasis, string> = {
  same_weekday_last_week: "vs last week",
  previous_7_days: "vs previous week",
  previous_30_days: "vs previous 30 days",
}

export function metricLabel(name: string, range: InsightsRange): string {
  return range === "today" ? `${name} today` : `${name}, ${RANGE_SUFFIX[range]}`
}

/**
 * "+9% vs previous week" / "−2 vs last week" / "Nothing to compare yet".
 *
 * ⚠ THE SIGN AND THE ARROW CARRY THE DIRECTION, NOT A COLOUR. The imported design coloured these
 * green and red; green fails the platform's text-contrast bar (it is a non-text indicator only) and
 * red is the error colour — a quieter week is not an error. Rendered in greyscale, "▼ 3%" still says
 * exactly what it means (research R15).
 */
export function deltaText(figure: InsightsFigureDTO, basis: ComparisonBasis): string {
  const { kind, amount } = figure.change
  if (kind === "none" || amount === null) return "Nothing to compare yet"

  const n = Number(amount)
  const arrow = n > 0 ? "▲" : n < 0 ? "▼" : "–"
  const magnitude = Math.abs(n)
  const body = kind === "pct" ? `${magnitude}%` : String(magnitude)
  return `${arrow} ${body} ${BASIS_LABEL[basis]}`
}

/** "26 August – 1 September · compared with the previous week · updated a moment ago". */
export function windowSubtitle(dto: ShopInsightsDTO, now: number): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "long",
      timeZone: dto.timezone,
    }).format(new Date(iso))

  const window =
    dto.range === "today"
      ? fmt(dto.window.from)
      : `${fmt(dto.window.from)} – ${fmt(dto.window.to)}`

  const compared =
    dto.comparison.basis === "same_weekday_last_week"
      ? "compared with the same day last week"
      : dto.comparison.basis === "previous_7_days"
        ? "compared with the previous week"
        : "compared with the previous 30 days"

  return `${window} · ${compared} · ${freshness(dto.computedAt, now)}`
}

/**
 * "updated a moment ago" / "updated 4 minutes ago" / "not updated yet".
 *
 * ⚠ NULL IS NOT "JUST NOW". A shop whose rollups have never run shows zeros, and the difference
 * between "nothing sold" and "we have not measured yet" is exactly what this phrase carries.
 */
export function freshness(computedAt: string | null, now: number): string {
  if (computedAt === null) return "not updated yet"
  const minutes = Math.floor(Math.max(0, now - new Date(computedAt).getTime()) / 60_000)
  if (minutes < 1) return "updated a moment ago"
  if (minutes === 1) return "updated 1 minute ago"
  if (minutes < 60) return `updated ${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  return `updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`
}

/** Money for display, from the server's decimal string. */
export function money(amount: string, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount))
}

/** Bar heights as percentages of the tallest bar, so an empty window draws nothing rather than NaN. */
export function barHeights(values: readonly number[]): number[] {
  const max = Math.max(0, ...values)
  if (max <= 0) return values.map(() => 0)
  return values.map((v) => Math.round((v / max) * 100))
}
