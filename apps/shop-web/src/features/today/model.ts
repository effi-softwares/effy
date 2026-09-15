import type { ShopAttentionItemDTO, ShopTodayDTO } from "@effy/shared-types"

/**
 * Today's copy and time formatting (058).
 *
 * ⚠ THE COPY LIVES HERE, NOT IN THE COMPONENTS. Every string on this screen is quoted verbatim from
 * the brief, and several are assembled from the same figures in more than one place ("{units} units
 * to pack" appears in the attention row and in the glance cell). One builder means one wording; two
 * components writing their own template strings is how a screen ends up saying "3 orders" in one
 * place and "3 order" in another.
 *
 * ⚠ AGES ARE COMPUTED FROM THE SERVER'S CLOCK, passed in as `now`. A shop tablet's clock can be
 * minutes out — or wrong by a day — and "oldest 3 h 12 m" derived from it would be confidently
 * incorrect about the one thing this card exists to convey: urgency.
 */

/** "3 h 12 m" / "14 m" / "2 d 4 h" — the card's age format. */
export function formatAge(fromIso: string, now: number): string {
  const ms = Math.max(0, now - new Date(fromIso).getTime())
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes} m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} m`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

/**
 * "Just now" → "1 min ago" → "3 min ago" → "2 h ago".
 *
 * ⚠ These must AGE without new data (FR-009): a row that says "Just now" twenty minutes later is
 * worse than one with no timestamp at all, because it is read as new.
 */
export function relativeTime(fromIso: string, now: number): string {
  const minutes = Math.floor(Math.max(0, now - new Date(fromIso).getTime()) / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes === 1) return "1 min ago"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}

/** An arrival is "New" only for its first minute — after that the badge is just decoration. */
export const NEW_WINDOW_MS = 60_000

export function isNewArrival(paidAtIso: string, now: number): boolean {
  return now - new Date(paidAtIso).getTime() < NEW_WINDOW_MS
}

/** "Monday 1 September · Melbourne" — weekday, date and the shop's timezone city, all derived. */
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

/** `Australia/Melbourne` → "Melbourne"; `America/New_York` → "New York". */
export function cityOf(timezone: string): string {
  const last = timezone.split("/").pop() ?? timezone
  return last.replace(/_/g, " ")
}

export const METHOD_LABEL: Record<"same_day" | "standard", string> = {
  same_day: "Same-day",
  standard: "Standard",
}

/** "3 min ago · 4 items · Same-day" — the meta line under a live order. */
export function liveMeta(
  o: { paidAt: string; itemCount: number; deliveryMethod: "same_day" | "standard" | null },
  now: number,
): string {
  const items = `${o.itemCount} ${o.itemCount === 1 ? "item" : "items"}`
  const method = o.deliveryMethod ? METHOD_LABEL[o.deliveryMethod] : "Delivery"
  return `${relativeTime(o.paidAt, now)} · ${items} · ${method}`
}

/** What a Needs attention row says, and which verb resolves it. */
export interface AttentionRow {
  title: string
  detail: string
  action: string
  /** `problem` is the only one that earns the destructive marker: an empty shelf is lost sales now. */
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
        detail:
          item.soldLast7Days > 0
            ? `${item.soldLast7Days} sold in the last 7 days, 0 on hand`
            : "0 on hand",
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

/** "11 units to pack" — the phrase the attention row and the glance cell must both use. */
export function unitsToPack(units: number): string {
  return `${units} ${units === 1 ? "unit" : "units"} to pack`
}

/** Where a row's button goes. Every one resolves the thing it describes (FR-004). */
export function attentionHref(item: ShopAttentionItemDTO): string {
  switch (item.kind) {
    case "awaiting_pick":
      return "/orders?tab=new"
    case "out_of_stock":
    case "low_stock":
      return `/catalog/${item.productId}`
    case "refund_proposed":
      return `/orders/${item.fulfillmentId}`
  }
}

/** The count badge: open items, including the ones the card could not fit. */
export function openItemCount(today: ShopTodayDTO): number {
  return today.attention.length + today.attentionMore
}
