import {
  MESSAGE_AUDIENCE_WORDS,
  MESSAGE_KINDS,
  MESSAGE_STATUS_WORDS,
  type AudienceFilter,
  type CustomerAudienceFilter,
  type DriverAudienceFilter,
  type MessageDestination,
  type MessageKind,
  type MessageStatus,
  type NotificationAudience,
  type ShopAudienceFilter,
} from "@effy/shared-types"
import type { StatusTone } from "@effy/web-kit/patterns"

export const KIND_WORD: Record<MessageKind, string> = Object.fromEntries(
  MESSAGE_KINDS.map((k) => [k.kind, k.label]),
) as Record<MessageKind, string>

export const STATUS_WORD = MESSAGE_STATUS_WORDS

export const STATUS_TONE: Record<MessageStatus, StatusTone> = {
  draft: "muted",
  scheduled: "waiting",
  sending: "moving",
  sent: "done",
  stopped: "problem",
  cancelled: "quiet",
  withdrawn: "quiet",
  not_sent: "problem",
}

export const AUDIENCE_WORD: Record<NotificationAudience, string> = {
  customer: "Customers",
  driver: "Drivers",
  shop: "Shops",
}

export const audienceList = (as: readonly NotificationAudience[]) => as.map((a) => AUDIENCE_WORD[a]).join(", ")

/** Where a tap leads, in words. */
export function destinationWords(d: MessageDestination): string {
  switch (d.kind) {
    case "home":
      return "Home"
    case "orders":
      return "Their orders"
    case "order":
      return "One of their orders"
    case "points":
      return "Their points"
    case "sale":
      return "The sale"
    case "search":
      return d.query ? `Search for “${d.query}”` : "Search"
    case "aisle":
      return d.title ? `The ${d.title} aisle` : "An aisle"
    case "product":
      return "A product"
    case "today":
      return "Today"
    case "account":
      return "Account"
    case "run":
      return "A run"
    case "queue":
      return "The order queue"
    case "catalog":
      return "The catalogue"
    default:
      return "Home"
  }
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`

/** Who a message is for, in words: "Drivers on a delivery run today". */
export function filterWords(audience: NotificationAudience, filter: AudienceFilter): string {
  const parts: string[] = []
  if (audience === "customer") {
    const f = filter as CustomerAudienceFilter
    if (f.people) parts.push(plural(f.people.length, "chosen customer", "chosen customers"))
    if (f.postcodes) parts.push(`in ${f.postcodes.join(", ")}`)
    if (f.groups) parts.push(plural(f.groups.length, "coverage group", "coverage groups"))
    if (f.orderedWithinDays) parts.push(`ordered in the last ${f.orderedWithinDays} days`)
    if (f.neverOrdered) parts.push("never ordered")
    if (f.hasPoints) parts.push("have points")
    if (f.appUsers) parts.push("use the app")
  } else if (audience === "driver") {
    const f = filter as DriverAudienceFilter
    if (f.people) parts.push(plural(f.people.length, "chosen driver", "chosen drivers"))
    if (f.onDuty) parts.push("on duty now")
    if (f.workToday) parts.push("with work today")
    if (f.collectionToday) parts.push("on a collection run today")
    if (f.deliveryToday) parts.push("on a delivery round today")
    if (f.clearance)
      parts.push(`cleared for ${f.clearance.function}${f.clearance.zoneId ? " in an area" : " everywhere"}`)
  } else {
    const f = filter as ShopAudienceFilter
    if (f.shops) parts.push(plural(f.shops.length, "chosen shop", "chosen shops"))
    if (f.managersOnly) parts.push("managers only")
  }
  const who = audience === "shop" ? "Shop staff" : AUDIENCE_WORD[audience]
  return parts.length === 0 ? `All ${MESSAGE_AUDIENCE_WORDS[audience].many}` : `${who}: ${parts.join(" · ")}`
}

const dateTime = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
})
export const whenWords = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "-")

export const percent = (share: number | null) => (share === null ? "-" : `${Math.round(share * 100)}%`)
