import type { ComparisonBasis, InsightsFigureDTO, InsightsRange, ShopInsightsDTO } from "@effy/shared-types"

export const RANGE_TITLE: Record<InsightsRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
}

export const RANGE_PERIOD: Record<InsightsRange, string> = {
  today: "today",
  "7d": "last 7 days",
  "30d": "last 30 days",
}

const RANGE_SUFFIX: Record<InsightsRange, string> = {
  today: "today",
  "7d": "7 days",
  "30d": "30 days",
}

export const GRAIN_LABEL: Record<"hour" | "day" | "week", string> = {
  hour: "By hour",
  day: "By day",
  week: "By week",
}

export const BASIS_LABEL: Record<ComparisonBasis, string> = {
  same_weekday_last_week: "vs last week",
  previous_7_days: "vs previous week",
  previous_30_days: "vs previous 30 days",
}

export function metricLabel(name: string, range: InsightsRange): string {
  return range === "today" ? `${name} today` : `${name}, ${RANGE_SUFFIX[range]}`
}

export function deltaText(figure: InsightsFigureDTO, basis: ComparisonBasis): string {
  const { kind, amount } = figure.change
  if (kind === "none" || amount === null) return "Nothing to compare yet"

  const n = Number(amount)
  const arrow = n > 0 ? "▲" : n < 0 ? "▼" : "–"
  const magnitude = Math.abs(n)
  const body = kind === "pct" ? `${magnitude}%` : String(magnitude)
  return `${arrow} ${body} ${BASIS_LABEL[basis]}`
}

export function deltaToneClass(figure: InsightsFigureDTO): string {
  const { kind, amount } = figure.change
  if (kind === "none" || amount === null) return "text-muted-foreground"
  const n = Number(amount)
  if (n > 0) return "text-success"
  if (n < 0) return "text-destructive"
  return "text-muted-foreground"
}

export function windowSubtitle(dto: ShopInsightsDTO, now: number): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "long",
      timeZone: dto.timezone,
    }).format(new Date(iso))

  const window = dto.range === "today" ? fmt(dto.window.from) : `${fmt(dto.window.from)} – ${fmt(dto.window.to)}`

  const compared =
    dto.comparison.basis === "same_weekday_last_week"
      ? "compared with the same day last week"
      : dto.comparison.basis === "previous_7_days"
        ? "compared with the previous week"
        : "compared with the previous 30 days"

  return `${window} · ${compared} · ${freshness(dto.computedAt, now)}`
}

export function freshness(computedAt: string | null, now: number): string {
  if (computedAt === null) return "not updated yet"
  const minutes = Math.floor(Math.max(0, now - new Date(computedAt).getTime()) / 60_000)
  if (minutes < 1) return "updated a moment ago"
  if (minutes === 1) return "updated 1 minute ago"
  if (minutes < 60) return `updated ${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  return `updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`
}

export function money(amount: string, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount))
}

export function barHeights(values: readonly number[]): number[] {
  const max = Math.max(0, ...values)
  if (max <= 0) return values.map(() => 0)
  return values.map((v) => Math.round((v / max) * 100))
}
