import {
  DELIVERED_BY_WORDS,
  type CourierPickupDTO,
  type DeliveredBy,
  type ShopAttentionItemDTO,
  type ShopOrderCollectionDTO,
  type ShopTodayDTO,
} from "@effy/shared-types"

import { runTime } from "@/features/fulfillment/collection"
import { courierPickupLine } from "@/features/fulfillment/courierPickup"

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

const NEW_WINDOW_MS = 60_000

export function isNewArrival(paidAtIso: string, now: number): boolean {
  return now - new Date(paidAtIso).getTime() < NEW_WINDOW_MS
}

export function subheading(nowIso: string, timezone: string): string {
  const date = new Date(nowIso)
  const day = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(date)
  return `${day} · ${cityOf(timezone)}`
}

function cityOf(timezone: string): string {
  const last = timezone.split("/").pop() ?? timezone
  return last.replace(/_/g, " ")
}

export function liveMeta(
  o: {
    paidAt: string
    itemCount: number
    deliveredBy: DeliveredBy
    courierPickup?: CourierPickupDTO
    collection?: ShopOrderCollectionDTO
  },
  now: number,
  timezone?: string,
): string {
  const items = `${o.itemCount} ${o.itemCount === 1 ? "item" : "items"}`
  const who = o.courierPickup
    ? courierPickupLine(o.courierPickup)
    : o.collection
      ? `${DELIVERED_BY_WORDS[o.deliveredBy]} · ${runTime(o.collection, timezone)} run`
      : DELIVERED_BY_WORDS[o.deliveredBy]
  return `${relativeTime(o.paidAt, now)} · ${items} · ${who}`
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
      return "/orders?tab=new"
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
