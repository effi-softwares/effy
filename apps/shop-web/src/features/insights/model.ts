import { ORDER_SIZE_LABELS, READY_SPREAD_LABELS, type InsightsFigureDTO, type InsightsRange, type InsightsRhythmDTO, type InsightsTopProductDTO, type ShopInsightsDTO } from "@effy/shared-types"

export const RANGE_TITLE: Record<InsightsRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
}

/** Every Insights page has its own address. */
export const PAGE_PATH = {
  overview: "/insights",
  sales: "/insights/sales",
  products: "/insights/products",
  stock: "/insights/stock",
  service: "/insights/service",
} as const

/** What the two lines on a chart are called. */
export function periodNames(range: InsightsRange): [string, string] {
  if (range === "today") return ["Today", "A week ago"]
  return range === "7d" ? ["This week", "Last week"] : ["Last 30 days", "The 30 before"]
}

const PERIOD_NOUN: Record<InsightsRange, string> = { today: "day", "7d": "week", "30d": "month" }

export interface Headline {
  /** "A strong week. ", or the whole sentence when there is nothing to report. */
  mood: string
  /** Null when nothing sold: the sentence is `mood` alone. */
  revenue: string | null
  change: { word: "up" | "down"; amount: string } | null
}

/** The sentence the Overview opens with. The mood is the server's; the figures are links on the screen. */
export function headline(dto: ShopInsightsDTO): Headline {
  const { revenue, orders } = dto.primary
  if (Number(orders.value) === 0) {
    return { mood: dto.range === "today" ? "Nothing sold yet today." : "Nothing sold in this period.", revenue: null, change: null }
  }
  const noun = PERIOD_NOUN[dto.range]
  const mood = dto.briefing.mood ? `A ${dto.briefing.mood} ${noun}. ` : ""
  const { kind, amount } = revenue.change
  const n = Number(amount)
  return {
    mood,
    revenue: revenue.value,
    change: kind === "pct" && amount !== null ? { word: n >= 0 ? "up" : "down", amount: `${Math.round(Math.abs(n))}%` } : null,
  }
}

export interface Change {
  direction: "up" | "down" | "flat"
  /** Good is not always up: a shorter time to ready is good news with a down arrow. */
  tone: "good" | "bad" | "neutral"
  text: string
}

export function changeOf(figure: InsightsFigureDTO, unit = "%", goodWhenUp = true): Change | null {
  const { kind, amount } = figure.change
  if (kind === "none" || amount === null) return null
  const n = Number(amount)
  const direction = n > 0 ? "up" : n < 0 ? "down" : "flat"
  const tone = direction === "flat" ? "neutral" : (direction === "up") === goodWhenUp ? "good" : "bad"
  return { direction, tone, text: `${Math.abs(n)}${unit}` }
}

/** A chart's axis: "2 pm" for an hour; a day as the server labels it. */
export function bucketLabels(dto: ShopInsightsDTO): string[] {
  return dto.series.buckets.map((b) => (dto.series.grain === "hour" ? hourWords(Number(b.label)) : b.label))
}

export function hourWords(hour: number): string {
  return `${hour % 12 || 12} ${hour < 12 ? "am" : "pm"}`
}

export function minutes(seconds: string): string {
  return `${Math.round(Number(seconds) / 60)} min`
}

export const WEEKDAY_SHORT: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" }
export const WEEKDAY_NAME: Record<number, string> = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday" }

/** At least the working day; wider when this shop trades outside it. */
const FIRST_HOUR = 7
const LAST_HOUR = 21
const STEPS = 8

export interface RhythmGrid {
  hours: number[]
  rows: { weekday: number; cells: { hour: number; step: number | null; average: string }[] }[]
  peak: { weekday: number; hour: number }
}

export function rhythmGrid(rhythm: InsightsRhythmDTO): RhythmGrid {
  const first = Math.min(FIRST_HOUR, ...rhythm.cells.map((c) => c.hour))
  const last = Math.max(LAST_HOUR, ...rhythm.cells.map((c) => c.hour))
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const max = Math.max(1, ...rhythm.cells.map((c) => c.orders))
  const at = new Map(rhythm.cells.map((c) => [`${c.weekday}-${c.hour}`, c.orders]))
  const peak = rhythm.cells.reduce((a, b) => (b.orders > a.orders ? b : a), rhythm.cells[0]!)
  return {
    hours,
    peak: { weekday: peak.weekday, hour: peak.hour },
    rows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      cells: hours.map((hour) => {
        const orders = at.get(`${weekday}-${hour}`) ?? 0
        return {
          hour,
          step: orders === 0 ? null : Math.min(STEPS - 1, Math.floor((orders / max) * STEPS)),
          average: (orders / rhythm.weeks).toFixed(orders % rhythm.weeks === 0 ? 0 : 1),
        }
      }),
    })),
  }
}

export function rhythmSentence(peak: RhythmGrid["peak"]): string {
  return `${WEEKDAY_NAME[peak.weekday]} around ${hourWords(peak.hour)} is your busiest time.`
}

/** The range most orders fall in, said in minutes. */
export function spreadSentence(spread: readonly number[]): string {
  const most = spread.indexOf(Math.max(...spread))
  const label = READY_SPREAD_LABELS[most]!.toLowerCase()
  return `Most orders are ready in ${label.replace("-", " to ")} minutes.`
}

/** What moved in the ranking. A product new to the list has no place to compare, so it is not a mover. */
export function movers(products: readonly InsightsTopProductDTO[]) {
  const moved = products.flatMap((product, i) =>
    product.previousRank === null ? [] : [{ product, rank: i + 1, places: product.previousRank - (i + 1) }],
  )
  return {
    up: moved.filter((m) => m.places > 0).sort((a, b) => b.places - a.places).slice(0, 3),
    down: moved.filter((m) => m.places < 0).sort((a, b) => a.places - b.places).slice(0, 3),
  }
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

export function moneyCents(amount: string, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(amount))
}

// ---- redesign 2 ---------------------------------------------------------------------------------------------------

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

/** "14:30" → "2:30 pm"; "15:00" → "3 pm". */
export function timeWords(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number]
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`
}

/** "1-2" → "1 to 2"; "21+" → "21 or more". */
export function rangeWords(label: string): string {
  return label.endsWith("+") ? `${label.slice(0, -1)} or more` : label.replace("-", " to ")
}

/** The order-size range most orders fall in. */
export function commonestSize(sizes: readonly number[]): string | null {
  const max = Math.max(0, ...sizes)
  return max === 0 ? null : ORDER_SIZE_LABELS[sizes.indexOf(max)]!
}

/** The run with most orders not ready when its driver came; null when every order was ready. */
export function worstRun(runs: ShopInsightsDTO["runs"]) {
  return runs.filter((r) => r.due > r.ready).sort((a, b) => b.due - b.ready - (a.due - a.ready))[0] ?? null
}

/** The busiest weekday-and-hour over the rhythm's weeks, with its average orders an hour. */
export function busiest(rhythm: InsightsRhythmDTO | null): { weekday: number; hour: number; perHour: number } | null {
  if (!rhythm || rhythm.cells.length === 0) return null
  const top = rhythm.cells.reduce((a, b) => (b.orders > a.orders ? b : a))
  return { weekday: top.weekday, hour: top.hour, perHour: top.orders / Math.max(1, rhythm.weeks) }
}

export type WorthTier = "sales" | "week" | "later"
export const WORTH_TIER_WORDS: Record<WorthTier, string> = {
  sales: "Costing you sales",
  week: "To get right this week",
  later: "When you have time",
}

export interface WorthItem {
  key: string
  primary: string
  secondary: string
  to: string
  action: string
}

export interface WorthRow {
  id: "oos" | "runningOut" | "missedRun" | "cantSupply" | "busiest" | "notSelling" | "writtenOff"
  tier: WorthTier
  /** Null for a row that is advice, not a count. */
  n: number | null
  title: string
  desc: string
  to: string
  items: WorthItem[]
  /** Its figures could not be read; said, never shown as nothing to do. */
  failed?: boolean
}

/** What the period's figures say to do, biggest cost first. The wording is here; the facts are the server's. */
export function worthDoing(dto: ShopInsightsDTO): WorthRow[] {
  const stock = dto.stock
  const run = worstRun(dto.runs)
  const peak = busiest(dto.rhythm)
  const cant = dto.cantSupplyProducts
  const cantUnits = dto.secondary.cantSupply.units
  const written = stock ? stock.writtenOff.expired.units + stock.writtenOff.damaged.units : 0
  const writtenValue = stock ? Number(stock.writtenOff.expired.value) + Number(stock.writtenOff.damaged.value) : 0
  return [
    {
      id: "oos",
      tier: "sales",
      n: stock ? stock.outOfStock.length : null,
      failed: !stock,
      title: "Selling but out of stock",
      desc: "Customers can’t buy these until you restock",
      to: PAGE_PATH.stock,
      items: (stock?.outOfStock ?? []).map((o) => ({
        key: o.variantId,
        primary: o.name,
        secondary: `Sold ${o.sold} ${RANGE_IN[dto.range]}`,
        to: `/catalog/${o.productId}?size=${o.variantId}`,
        action: "Restock",
      })),
    },
    {
      id: "runningOut",
      tier: "sales",
      n: stock ? stock.runningOut.length : null,
      failed: !stock,
      title: "Will run out within 3 days",
      desc: "At the pace of the last 4 weeks",
      to: PAGE_PATH.stock,
      items: (stock?.runningOut ?? []).map((r) => ({
        key: r.productId,
        primary: r.name,
        secondary: `${r.left} left · sells about ${Math.round(Number(r.perDay))} a day`,
        to: `/catalog/${r.productId}`,
        action: "Restock",
      })),
    },
    {
      id: "missedRun",
      tier: "week",
      n: run ? run.due - run.ready : 0,
      title: run ? `Not ready for the ${timeWords(run.time)} driver` : "Ready for every driver",
      desc: run ? "The run you miss most. Start its orders earlier." : "Every order was ready when its driver came",
      to: PAGE_PATH.service,
      items: [],
    },
    {
      id: "cantSupply",
      tier: "week",
      n: cantUnits,
      title: "Items you couldn’t supply",
      desc: cant[0] ? `${cant[0].name} caused ${cant[0].units}. Check its stock count.` : "You supplied everything",
      to: PAGE_PATH.service,
      items: [],
    },
    {
      id: "busiest",
      tier: "week",
      n: null,
      title: peak ? `${WEEKDAY_NAME[peak.weekday]} around ${hourWords(peak.hour)} is your busiest` : "Your busiest time",
      desc: peak
        ? `About ${Math.round(peak.perHour)} ${Math.round(peak.perHour) === 1 ? "order" : "orders"} an hour.${peak.perHour >= 5 ? " Plan two people picking." : ""}`
        : "Appears after two weeks of orders",
      to: PAGE_PATH.sales,
      items: [],
    },
    {
      id: "notSelling",
      tier: "later",
      n: stock ? (stock.notSelling?.length ?? 0) : null,
      failed: !stock,
      title: "Not sold in 30 days",
      desc: stock?.notSelling
        ? `${money(String(stock.notSelling.reduce((n, p) => n + Number(p.value), 0)), dto.currency)} of stock at your prices`
        : "Appears after 30 days of sales",
      to: PAGE_PATH.stock,
      items: [],
    },
    {
      id: "writtenOff",
      tier: "later",
      n: stock ? written : null,
      failed: !stock,
      title: "Written off",
      desc: `Expired or damaged, ${money(String(writtenValue), dto.currency)} at your prices`,
      to: PAGE_PATH.stock,
      items: [],
    },
  ]
}

/** "this week", for a sentence. */
export const RANGE_IN: Record<InsightsRange, string> = { today: "today", "7d": "this week", "30d": "in 30 days" }
