import {
  DELIVERED_BY_WORDS,
  type ShopOrderRowDTO,
  type ShopTodayAheadDTO,
  type ShopTodayDTO,
  type ShopTodayEventDTO,
  type ShopTodayRunDTO,
} from "@effy/shared-types"

import { courierPickupLine } from "@/features/fulfillment/courierPickup"
import { formatMoney } from "@/features/fulfillment/orderConsole"

// ---- words for time -------------------------------------------------------------------------------------------------

export function formatAge(fromIso: string, now: number): string {
  const ms = Math.max(0, now - new Date(fromIso).getTime())
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes} m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} m`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

export function relativeTime(fromIso: string, now: number): string {
  const minutes = Math.floor(Math.max(0, now - new Date(fromIso).getTime()) / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes === 1) return "1 min ago"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}

/** "Monday 2 November", on the shop's clock. */
export function todayDate(nowIso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(new Date(nowIso))
}

/** Hours since the shop's midnight, with minutes as a fraction: where an instant sits on the day line. */
export function hoursOf(iso: string | number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).formatToParts(new Date(iso))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get("hour") + get("minute") / 60
}

/** "2:30 pm", "3 pm": the time, on the shop's clock. */
export function clock(iso: string | number, timezone: string): string {
  return clockWords(hoursOf(iso, timezone))
}

export function clockWords(h: number): string {
  const hh = Math.floor(h)
  const m = Math.round((h - hh) * 60)
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${hh % 24 < 12 ? "am" : "pm"}`
}

/** "48 min", "1 h 10 min". */
export function untilWords(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const rest = m % 60
  return `${Math.floor(m / 60)} h${rest ? ` ${rest} min` : ""}`
}

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

export const minutesUntil = (iso: string, now: number) => (new Date(iso).getTime() - now) / 60_000

// ---- runs -----------------------------------------------------------------------------------------------------------

export const runTotal = (r: ShopTodayRunDTO) => r.collected + r.ready + r.picking + r.waiting
/** Ready or already gone with the driver. */
export const runPacked = (r: ShopTodayRunDTO) => r.collected + r.ready

/** The first run still to come today. */
export function nextRun(t: ShopTodayDTO, now: number): ShopTodayRunDTO | null {
  return t.runs.find((r) => new Date(r.runAt).getTime() > now && r.driver !== "collected") ?? null
}

export type RunStateWord = "Missed" | "Collected" | "No orders yet" | "Ready" | "Packing" | "Coming up"

/** One word for where a run stands, and its tone. */
export function runState(r: ShopTodayRunDTO, next: ShopTodayRunDTO | null, now: number): { word: RunStateWord; tone: "bad" | "good" | "info" | "warn" | "quiet" } {
  const past = r.driver === "collected" || new Date(r.runAt).getTime() <= now
  if (past && r.missed > 0) return { word: "Missed", tone: "bad" }
  if (past) return { word: "Collected", tone: "good" }
  const total = runTotal(r)
  if (total === 0) return { word: "No orders yet", tone: "quiet" }
  if (runPacked(r) === total) return { word: "Ready", tone: "info" }
  if (r === next) return { word: "Packing", tone: "warn" }
  return { word: "Coming up", tone: "quiet" }
}

/** Where the run's driver is, in a shop's words. Never a name or a place. */
export function driverWords(r: ShopTodayRunDTO, next: ShopTodayRunDTO | null, timezone: string): string {
  if (r.missed > 0 && r.driver === "collected") return `Left without ${r.missed}`
  if (r.driver === "collected") return r.collectedAt ? `Collected ${clock(r.collectedAt, timezone)}` : "Collected"
  if (r.driver === "on_the_way") return "On the way"
  if (r.driver === "assigned") return "Driver assigned"
  return r === next ? "Not left yet" : "Later today"
}

/** The day line's span: from the earliest order or 6 am to the last run, on whole hours; ticks every three. */
export function dayAxis(t: ShopTodayDTO, now: number): { from: number; to: number; ticks: number[] } {
  const tz = t.timezone
  const starts = t.runs.flatMap((r) => (r.firstPaidAt ? [hoursOf(r.firstPaidAt, tz)] : []))
  const ends = [...t.runs.map((r) => hoursOf(r.runAt, tz)), ...t.courierPickups.flatMap((p) => (p.from ? [hoursOf(p.from, tz)] : []))]
  const from = Math.max(0, Math.min(6, Math.floor(hoursOf(now, tz)), ...starts.map(Math.floor)))
  const to = Math.min(24, Math.max(from + 6, 21, ...ends.map((h) => Math.ceil(h + 0.5))))
  const ticks: number[] = []
  for (let h = from + ((3 - (from % 3)) % 3); h <= to; h += 3) ticks.push(h)
  return { from, to, ticks }
}

// ---- the sentence ---------------------------------------------------------------------------------------------------

/** A run of words in the sentence; `to` makes it a link. */
export interface BriefPart {
  text: string
  to?: string
}

export interface Brief {
  tone: "good" | "bad" | "warn" | "quiet"
  label: string
  lead: BriefPart[]
  rest: BriefPart[]
  /** Something has already gone wrong: the sentence sits on a rose ground. */
  stopped: boolean
}

const UPPER = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The things that cost sales, said once after the main point: out of stock, a refund to approve. */
function extras(t: ShopTodayDTO): BriefPart[] {
  const out = t.outOfStock.length + t.outOfStockMore
  const parts: BriefPart[][] = []
  if (out > 0) {
    parts.push([
      { text: out === 1 ? t.outOfStock[0]!.name : `${out} products`, to: "/catalog/availability?filter=out_of_stock" },
      { text: out === 1 ? " is out of stock" : " are out of stock" },
    ])
  }
  if (t.refunds.length > 0) {
    parts.push([
      { text: t.refunds.length === 1 ? "a refund" : `${t.refunds.length} refunds`, to: `/orders/${t.refunds[0]!.fulfillmentId}` },
      { text: t.refunds.length === 1 ? " is waiting for your approval" : " are waiting for your approval" },
    ])
  }
  if (parts.length === 0) return []
  const joined = parts.flatMap((p, i) => (i === 0 ? p : [{ text: ", and " }, ...p]))
  joined[0] = { ...joined[0]!, text: UPPER(joined[0]!.text) }
  return [...joined, { text: "." }]
}

/** One sentence about the day: what matters most right now, said plainly. */
export function briefOf(t: ShopTodayDTO, now: number): Brief {
  const tz = t.timezone
  const next = nextRun(t, now)
  const tail = extras(t)
  const pick = t.backlog.awaitingPick.orders

  if (t.late.length > 0) {
    const missed = t.late[0]!.missedRunAt
    const goesOn = t.late[0]!.nextRunAt
    return {
      tone: "bad",
      label: t.late.length === 1 ? "An order missed its driver" : "Orders missed a driver",
      stopped: true,
      lead: [
        { text: plural(t.late.length, "order"), to: "/orders?attention=at_risk" },
        { text: ` missed the ${clock(missed, tz)} Effy driver.` },
      ],
      rest: [
        {
          text: goesOn
            ? `${t.late.length === 1 ? "It goes" : "They go"} with the ${clock(goesOn, tz)} driver if ${t.late.length === 1 ? "it’s" : "they’re"} ready by then. Finish ${t.late.length === 1 ? "it" : "these"} first. `
            : "No driver is left today; Effy collects them on the first run tomorrow. ",
        },
        ...tail,
      ],
    }
  }

  const usualStart = t.ahead.find((a) => a.kind === "orders_start")
  const first = t.runs[0]
  if (usualStart && first && new Date(first.runAt).getTime() > now && new Date(usualStart.at).getTime() > now) {
    return {
      tone: "quiet",
      label: "Before the day starts",
      stopped: false,
      lead: [{ text: "A quiet start." }],
      rest: [
        ...(pick > 0 ? [{ text: plural(pick, "order"), to: "/orders?tab=new" }, { text: " to pick. " }] : []),
        { text: `The first Effy driver comes at ${clock(first.runAt, tz)}, and orders usually pick up from ${clock(usualStart.at, tz)}. ` },
        ...tail,
      ],
    }
  }

  if (next && next.picking + next.waiting > 0) {
    const left = next.picking + next.waiting
    return {
      tone: "warn",
      label: `${untilWords(minutesUntil(next.runAt, now))} to the next driver`,
      stopped: false,
      lead: [
        { text: plural(left, "order"), to: "/orders?tab=new" },
        { text: ` still to pack for the ${clock(next.runAt, tz)} Effy driver.` },
      ],
      rest: [{ text: `${next.ready} of ${runTotal(next)} ${runTotal(next) === 1 ? "is" : "are"} ready. ` }, ...tail],
    }
  }

  if (pick > 0) {
    return {
      tone: "warn",
      label: "Orders to pick",
      stopped: false,
      lead: [{ text: plural(pick, "order"), to: "/orders?tab=new" }, { text: " waiting to be picked." }],
      rest: [{ text: next ? `The next Effy driver comes at ${clock(next.runAt, tz)}. ` : "No more Effy drivers today. " }, ...tail],
    }
  }

  return {
    tone: "good",
    label: "On track",
    stopped: false,
    lead: [{ text: "Everything is packed." }],
    rest: [
      {
        text: next
          ? runTotal(next) > 0
            ? `The ${clock(next.runAt, tz)} Effy driver collects ${plural(runTotal(next), "order")}. `
            : `The next Effy driver comes at ${clock(next.runAt, tz)}. `
          : "No more Effy drivers today. ",
      },
      ...(tail.length ? tail : [{ text: "Nothing else needs you right now." }]),
    ],
  }
}

// ---- coming up ------------------------------------------------------------------------------------------------------

export interface ComingItem {
  key: string
  title: string
  detail: string
  at: string
  to: string
}

/** The next three things on the clock: drivers, courier pickups, and the usual busiest hour. */
export function comingUp(t: ShopTodayDTO, now: number): ComingItem[] {
  const tz = t.timezone
  const items: ComingItem[] = []
  for (const r of t.runs) {
    if (new Date(r.runAt).getTime() <= now || r.driver === "collected") continue
    const total = runTotal(r)
    items.push({
      key: `run-${r.runAt}`,
      title: `${clock(r.runAt, tz)} Effy driver`,
      detail: total ? `${runPacked(r)} of ${total} ready` : "No orders on this run yet",
      at: r.runAt,
      to: "/orders?tab=new",
    })
  }
  for (const p of t.courierPickups) {
    if (!p.from || new Date(p.from).getTime() <= now || p.handedOver >= p.parcels) continue
    items.push({
      key: `pickup-${p.from}-${p.courierName ?? ""}`,
      title: "Courier pickup",
      detail: `${p.courierName ?? "The courier"} collects ${plural(p.parcels - p.handedOver, "parcel")}`,
      at: p.from,
      to: "/orders?deliveredBy=courier",
    })
  }
  const busiest = t.ahead.find((a) => a.kind === "busiest")
  if (busiest && new Date(busiest.at).getTime() > now) {
    items.push({ key: "busiest", title: "Usually your busiest hour", detail: "From the last few weeks", at: busiest.at, to: "/insights/sales" })
  }
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(0, 3)
}

// ---- needs you ------------------------------------------------------------------------------------------------------

export type Tier = "stop" | "soon" | "later"
export const TIER_WORDS: Record<Tier, string> = {
  stop: "Before the next driver",
  soon: "Costing you sales",
  later: "When you have time",
}

export interface NeedItem {
  key: string
  primary: string
  secondary: string
  /** Where the row's own button goes; `pick` starts picking the order first. */
  action: { label: string; to: string; pick?: string }
}

export interface NeedRow {
  id: "late" | "pick" | "handover" | "oos" | "refund" | "low" | "details" | "sentBack" | "review"
  tier: Tier
  n: number
  title: string
  desc: string
  age: string | null
  old: boolean
  to: string
  items: NeedItem[]
  /** Information only: in review with Effy, nothing to do. */
  quiet?: boolean
}

/** "6 items · for the 2:30 pm driver · waited 41 m": one order waiting to be picked. */
export function pickDetail(o: ShopOrderRowDTO, timezone: string, now: number): string {
  const items = plural(o.itemCount, "item")
  const who = o.courierPickup
    ? courierPickupLine(o.courierPickup)
    : o.collection
      ? `for the ${clock(o.collection.runAt, timezone)} driver`
      : DELIVERED_BY_WORDS[o.deliveredBy]
  return `${items} · ${who} · waited ${formatAge(o.placedAt, now)}`
}

const STAGE_WORDS = { waiting: "not started", picking: "being picked", ready: "ready now" } as const

/** Everything that needs someone, in three tiers. `waiting` is the queue's oldest-first list of orders to pick. */
export function needsRows(t: ShopTodayDTO, waiting: readonly ShopOrderRowDTO[] | undefined, now: number): NeedRow[] {
  const tz = t.timezone
  const next = nextRun(t, now)
  const pick = t.backlog.awaitingPick
  const handover = t.courierPickups.filter((p) => p.parcels > p.handedOver)
  const out = t.outOfStock.length + t.outOfStockMore
  const low = Math.max(0, t.backlog.lowStock.skus - t.backlog.lowStock.outOfStock)
  return [
    {
      id: "late",
      tier: "stop",
      n: t.late.length,
      title: t.late.length === 1 ? "Order missed its driver" : "Orders missed their driver",
      desc: "Pack these first: they go with the next driver",
      age: t.late[0] ? `Missed the ${clock(t.late[0].missedRunAt, tz)} driver` : null,
      old: true,
      to: "/orders?attention=at_risk",
      items: t.late.map((l) => ({
        key: l.fulfillmentId,
        primary: l.orderNumber,
        secondary: `${plural(l.units, "item")} · ${STAGE_WORDS[l.stage]}${l.picker && l.stage === "picking" ? ` by ${l.picker}` : ""}`,
        action: { label: "Open", to: `/orders/${l.fulfillmentId}` },
      })),
    },
    {
      id: "pick",
      tier: "stop",
      n: pick.orders,
      title: "Orders to pick",
      desc: `${plural(pick.units, "unit")} · oldest first`,
      age: next ? `Next driver ${clock(next.runAt, tz)}` : pick.oldestPaidAt ? `Oldest waited ${formatAge(pick.oldestPaidAt, now)}` : null,
      old: false,
      to: "/orders?tab=new",
      items: (waiting ?? []).slice(0, 5).map((o) => ({
        key: o.id,
        primary: o.orderNumber,
        secondary: pickDetail(o, tz, now),
        action: o.status === "pending" ? { label: "Open order", to: `/orders/${o.id}` } : { label: "Start picking", to: `/orders/${o.id}`, pick: o.id },
      })),
    },
    {
      id: "handover",
      tier: "stop",
      n: handover.reduce((n, p) => n + p.parcels - p.handedOver, 0),
      title: "Courier parcels to hand over",
      desc: handover[0]
        ? `${handover[0].courierName ?? "The courier"} collects${handover[0].from ? ` at ${clock(handover[0].from, tz)}` : " today"}`
        : "Parcels a courier collects from you today",
      age: null,
      old: false,
      to: "/orders?deliveredBy=courier",
      items: [],
    },
    {
      id: "oos",
      tier: "soon",
      n: out,
      title: "Out of stock",
      desc: "Customers can’t buy these until you restock",
      age: t.outOfStock[0] ? `Since ${relativeTime(t.outOfStock[0].since, now).toLowerCase()}` : null,
      old: false,
      to: "/catalog/availability?filter=out_of_stock",
      items: t.outOfStock.slice(0, 5).map((s) => ({
        key: s.variantId,
        primary: s.name,
        secondary: s.soldLast7Days > 0 ? `Sold ${s.soldLast7Days} in the last 7 days` : "None on hand",
        action: { label: "Restock", to: `/catalog/${s.productId}?size=${s.variantId}` },
      })),
    },
    {
      id: "refund",
      tier: "soon",
      n: t.refunds.length,
      title: t.refunds.length === 1 ? "Refund waiting for you" : "Refunds waiting for you",
      desc: "Effy proposed them for items you couldn’t supply",
      age: t.refunds[0] ? `Oldest ${formatAge(t.refunds[0].since, now)}` : null,
      old: false,
      to: t.refunds[0] ? `/orders/${t.refunds[0].fulfillmentId}` : "/orders",
      items: t.refunds.slice(0, 5).map((r) => ({
        key: r.fulfillmentId,
        primary: r.orderNumber,
        secondary: formatMoney(r.amount),
        action: { label: "Review", to: `/orders/${r.fulfillmentId}` },
      })),
    },
    { id: "low", tier: "later", n: low, title: "Running low", desc: "Below the alert level you set", age: null, old: false, to: "/catalog/availability?filter=low_stock", items: [] },
    {
      id: "details",
      tier: "later",
      n: t.catalog.missingDetails,
      title: "Products missing details",
      desc: "Effy needs a detail; they stay on sale until you fill it",
      age: null,
      old: false,
      to: "/catalog?missing=true",
      items: [],
    },
    {
      id: "sentBack",
      tier: "later",
      n: t.catalog.sentBack,
      title: "Sent back by Effy",
      desc: "Products or changes Effy asked you to fix",
      age: null,
      old: false,
      to: "/catalog?reviewState=sent_back",
      items: [],
    },
    {
      id: "review",
      tier: "later",
      n: t.catalog.inReview,
      title: "With Effy for review",
      desc: "Nothing to do: they go live once approved",
      age: null,
      old: false,
      to: "/catalog?reviewState=in_review",
      items: [],
      quiet: true,
    },
  ]
}

export function tiersOf(rows: readonly NeedRow[]): { tier: Tier; live: NeedRow[]; clear: NeedRow[] }[] {
  return (["stop", "soon", "later"] as const).map((tier) => {
    const mine = rows.filter((r) => r.tier === tier)
    return { tier, live: mine.filter((r) => r.n > 0), clear: mine.filter((r) => r.n === 0 && !r.quiet) }
  })
}

// ---- what happened, what is ahead ------------------------------------------------------------------------------------

/** One thing that happened, in words. Written here so the server sends facts. */
export function eventWords(e: ShopTodayEventDTO): { code: string | null; words: string; note: string | null } {
  switch (e.kind) {
    case "came_in":
      return {
        code: e.orderNumber,
        words: "came in",
        note: `${plural(e.itemCount, "item")} · ${DELIVERED_BY_WORDS[e.deliveredBy]}`,
      }
    case "picking":
      return { code: e.orderNumber, words: "picking started", note: null }
    case "ready":
      return { code: e.orderNumber, words: "is ready", note: null }
    case "collected":
      return e.orderNumber
        ? { code: e.orderNumber, words: "was collected", note: null }
        : { code: null, words: `${e.orders} orders collected`, note: null }
    case "delivered":
      return { code: e.orderNumber, words: "was delivered", note: null }
    case "cant_supply":
      return { code: e.orderNumber, words: "could not be supplied", note: null }
    case "cancelled":
      return { code: e.orderNumber, words: "was cancelled", note: null }
    case "sold_out":
      return { code: null, words: `${e.name} sold out`, note: null }
    case "restocked":
      return { code: null, words: `${e.name} is back in stock`, note: null }
  }
}

/** What is still to come, in words. A usual time always says "usually": it is a pattern, not a promise. */
export function aheadWords(a: ShopTodayAheadDTO): { words: string; note: string | null } {
  switch (a.kind) {
    case "run":
      return {
        words: DELIVERED_BY_WORDS.effy_driver,
        note: a.orders === 0 ? "No orders on this run yet" : `${plural(a.orders, "order")} so far`,
      }
    case "orders_start":
      return { words: "Orders usually start coming in", note: null }
    case "busiest":
      return { words: "Usually your busiest hour", note: null }
  }
}
