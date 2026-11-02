import {
  DELIVERED_BY_WORDS,
  type ShopAttentionItemDTO,
  type ShopNextCollectionDTO,
  type ShopOrderRowDTO,
  type ShopTodayAheadDTO,
  type ShopTodayEventDTO,
  type ShopTodayDTO,
} from "@effy/shared-types"

import { runTime, timeOf } from "@/features/fulfillment/collection"
import { courierPickupLine } from "@/features/fulfillment/courierPickup"
import { formatMoney } from "@/features/fulfillment/orderConsole"

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

/** "1:49 pm", on the shop's clock. */
export function eventTime(iso: string, timezone: string): string {
  return timeOf(iso, timezone)
}

/** A big number while the run is today and under an hour away; otherwise the time it runs. */
export interface CollectionClock {
  /** Set when the big figure is a count of minutes, so it can roll. */
  minutes: number | null
  big: string
  unit: string
}

export function collectionClock(next: ShopNextCollectionDTO, now: number, timezone?: string): CollectionClock {
  if (next.dayOffset > 0) {
    const when = runTime(next, timezone)
    const time = timeOf(next.runAt, timezone)
    return { minutes: null, big: time, unit: when.replace(time, "").trim() }
  }
  const minutes = Math.ceil((new Date(next.runAt).getTime() - now) / 60_000)
  if (minutes <= 0) return { minutes: null, big: "Due", unit: "now" }
  if (minutes < 60) return { minutes, big: String(minutes), unit: "min" }
  return { minutes: null, big: `${Math.floor(minutes / 60)} h`, unit: `${minutes % 60} min` }
}

/** The sentence beside the clock. It starts lower-case on purpose: it reads on from the number. */
export function collectionLine(next: ShopNextCollectionDTO, clock: CollectionClock, timezone?: string): string {
  const total = next.due.ready + next.due.picking
  const left = next.due.picking
  const what =
    total === 0
      ? "None of your orders are due on this run yet."
      : left === 0
        ? "Every order is ready."
        : `${left} ${left === 1 ? "order" : "orders"} still to pack.`
  if (next.dayOffset > 0) return `is your next driver. ${what}`
  if (clock.big === "Due") return `The ${runTime(next, timezone)} driver is due. ${what}`
  return `until the ${runTime(next, timezone)} driver. ${what}`
}

/** One thing that happened, in words. Written here so the server sends facts, as it does for attention. */
export function eventWords(e: ShopTodayEventDTO): { code: string | null; words: string; note: string | null } {
  switch (e.kind) {
    case "came_in":
      return {
        code: e.orderNumber,
        words: "came in",
        note: `${e.itemCount} ${e.itemCount === 1 ? "item" : "items"} · ${DELIVERED_BY_WORDS[e.deliveredBy]}`,
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
        note: a.orders === 0 ? "No orders on this run yet" : `${a.orders} ${a.orders === 1 ? "order" : "orders"} so far`,
      }
    case "orders_start":
      return { words: "Orders usually start coming in", note: null }
    case "busiest":
      return { words: "Usually your busiest hour", note: null }
  }
}

/** One thing to do. `kind` decides the action: only `pick` acts here; the rest open where the work is. */
export interface Job {
  key: string
  kind: "pick" | "open" | "out_of_stock" | "low_stock" | "refund"
  title: string
  /** The order's number, set in the code face after the title. */
  code: string | null
  detail: string
  when: string
  late: boolean
  tone: "problem" | "neutral"
  action: string
  fulfillmentId: string | null
  href: string
}

/** Late work first, then what the next driver needs, then what costs sales, then the rest. */
const RANK = { late: 0, nextRun: 1, out_of_stock: 2, refund: 3, later: 4, low_stock: 5 } as const

function orderJob(o: ShopOrderRowDTO, nextRunAt: string | null, timezone: string, now: number): { rank: number; job: Job } {
  const nextRun = !!o.collection && o.collection.runAt === nextRunAt
  const items = `${o.itemCount} ${o.itemCount === 1 ? "item" : "items"}`
  const who = o.courierPickup
    ? courierPickupLine(o.courierPickup)
    : o.collection
      ? `for the ${runTime(o.collection, timezone)} run`
      : DELIVERED_BY_WORDS[o.deliveredBy]
  const pending = o.status === "pending"
  return {
    rank: o.atRisk ? RANK.late : nextRun ? RANK.nextRun : RANK.later,
    job: {
      key: `order-${o.id}`,
      kind: pending ? "open" : "pick",
      title: pending ? "Open" : "Pick",
      code: o.orderNumber,
      detail: `${items} ${who} · waited ${formatAge(o.placedAt, now)}`,
      when: o.atRisk ? "Late" : o.collection ? runTime(o.collection, timezone) : DELIVERED_BY_WORDS[o.deliveredBy],
      late: o.atRisk,
      tone: "neutral",
      action: pending ? "Open order" : "Start picking",
      fulfillmentId: o.id,
      href: `/orders/${o.id}`,
    },
  }
}

function attentionJob(item: ShopAttentionItemDTO): { rank: number; job: Job } | null {
  switch (item.kind) {
    case "awaiting_pick":
      return null // Listed order by order.
    case "out_of_stock":
      return {
        rank: RANK.out_of_stock,
        job: {
          key: `stock-${item.variantId}`, kind: "out_of_stock", title: `Restock ${item.name}`, code: null,
          detail: item.soldLast7Days > 0 ? `Sold ${item.soldLast7Days} in the last 7 days` : "0 on hand",
          when: "Out of stock", late: false, tone: "problem", action: "Restock", fulfillmentId: null, href: attentionHref(item),
        },
      }
    case "low_stock":
      return {
        rank: RANK.low_stock,
        job: {
          key: `stock-${item.variantId}`, kind: "low_stock", title: `Top up ${item.name}`, code: null,
          detail: attentionRow(item, 0).detail,
          when: "Low stock", late: false, tone: "neutral", action: "Review", fulfillmentId: null, href: attentionHref(item),
        },
      }
    case "refund_proposed":
      return {
        rank: RANK.refund,
        job: {
          key: `refund-${item.fulfillmentId}`, kind: "refund", title: "Review a refund on", code: item.orderNumber,
          detail: formatMoney(item.amount),
          when: "Refund", late: false, tone: "neutral", action: "Review", fulfillmentId: item.fulfillmentId, href: attentionHref(item),
        },
      }
  }
}

/** How many sit under the lead job. */
const THEN = 3

export function buildJobs(input: {
  waiting: readonly ShopOrderRowDTO[]
  waitingTotal: number
  attention: readonly ShopAttentionItemDTO[]
  attentionMore: number
  nextRunAt: string | null
  timezone: string
  now: number
}): { jobs: Job[]; more: number } {
  const ranked = [
    ...input.waiting.map((o) => orderJob(o, input.nextRunAt, input.timezone, input.now)),
    ...input.attention.flatMap((a) => attentionJob(a) ?? []),
  ]
  // A stable sort: each list arrives oldest first, and stays that way within its rank.
  const all = ranked.sort((a, b) => a.rank - b.rank).map((r) => r.job)
  const shown = all.slice(0, THEN + 1)
  const unlisted = input.waitingTotal - input.waiting.length + input.attentionMore
  return { jobs: shown, more: all.length - shown.length + Math.max(0, unlisted) }
}

interface AttentionRow {
  title: string
  detail: string
  action: string
  tone: "problem" | "waiting" | "neutral"
}

export function attentionRow(item: ShopAttentionItemDTO, now: number): AttentionRow {
  switch (item.kind) {
    case "awaiting_pick":
      return {
        title: `${item.orders} ${item.orders === 1 ? "order" : "orders"} awaiting pick`,
        detail: `${unitsToPack(item.units)} · oldest ${formatAge(item.since, now)}`,
        action: "Pick",
        tone: "waiting",
      }
    case "out_of_stock":
      return {
        title: `${item.name} out of stock`,
        detail: item.soldLast7Days > 0 ? `${item.soldLast7Days} sold in the last 7 days, 0 on hand` : "0 on hand",
        action: "Restock",
        tone: "problem",
      }
    case "low_stock":
      return {
        title: `${item.name} below reorder point`,
        detail:
          item.daysOfCover === null
            ? `${item.onHand} on hand`
            : `${item.onHand} on hand, ${item.daysOfCover} ${item.daysOfCover === 1 ? "day" : "days"} of cover`,
        action: "Review",
        tone: "waiting",
      }
    case "refund_proposed":
      return {
        title: "Refund waiting for approval",
        detail: `${item.orderNumber} · ${item.amount}`,
        action: "Approve",
        tone: "neutral",
      }
  }
}

export function unitsToPack(units: number): string {
  return `${units} ${units === 1 ? "unit" : "units"} to pack`
}

export function attentionHref(item: ShopAttentionItemDTO): string {
  switch (item.kind) {
    case "awaiting_pick":
      return "/orders?view=table&tab=new"
    case "out_of_stock":
    case "low_stock":
      // Open the product on the size that needs stock.
      return `/catalog/${item.productId}?size=${item.variantId}`
    case "refund_proposed":
      return `/orders/${item.fulfillmentId}`
  }
}

export function openItemCount(today: ShopTodayDTO): number {
  return today.attention.length + today.attentionMore
}
