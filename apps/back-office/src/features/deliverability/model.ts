import type { ListPage } from "@effy/shared-types"
import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

export type EmailDeliveryState = "reachable" | "soft_failing" | "undeliverable" | "complained"

interface DeliverySubject {
  kind: "customer" | "shop_staff" | "admin_staff"
  id: string
  name: string | null
}

export interface DeliveryListItem {
  address: string
  state: EmailDeliveryState
  reason: string | null
  lastEventAt: string
  bounceCount: number
  complaintCount: number
  repairedAt: string | null
  subject: DeliverySubject | null
}

export interface DeliveryEvent {
  eventType: "bounce" | "complaint" | "delivery" | "reject" | "delivery_delay"
  subType: string | null
  messageId: string
  templateId: string | null
  occurredAt: string
}

export interface DeliveryDetail extends DeliveryListItem {
  diagnostic: string | null
  lastMessageId: string | null
  repairedBy: string | null
  suppressedInSes: boolean | null
  events: DeliveryEvent[]
}

/** A quick read: how many addresses need attention (the rail's and the overview's count). */
export type DeliveryListParams = Record<string, never>

export type DeliveryList = ListPage<DeliveryListItem>

export const DELIVERABILITY_VIEWS = ["problems", "undeliverable", "soft_failing", "complained", "reachable", "all"] as const
export type DeliverabilityView = (typeof DELIVERABILITY_VIEWS)[number]

/** The deliverability list's view in the address (103), mirroring the admin service's spec. */
export const deliverabilityList = defineListSearch({
  id: "deliverability",
  mode: "offset",
  sorts: ["lastEvent", "address"] as const,
  defaultSort: "lastEvent",
  sortDir: { lastEvent: "desc", address: "asc" },
  filters: { view: searchFilter.oneOf(DELIVERABILITY_VIEWS) },
})

export const STATE_LABEL: Record<EmailDeliveryState, string> = {
  reachable: "Reachable",
  soft_failing: "Having trouble",
  undeliverable: "Undeliverable",
  complained: "Reported as spam",
}

export const STATE_MEANING: Record<EmailDeliveryState, string> = {
  reachable: "Emails to this address are being delivered normally, with no problems recorded.",
  soft_failing: "Recent emails to this address bounced; this often clears up on its own.",
  undeliverable: "Emails are permanently rejected, so this person cannot receive sign-in codes.",
  complained: "An email was reported as spam; this does not stop them signing in.",
}
