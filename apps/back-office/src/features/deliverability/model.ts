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

export interface DeliveryListParams {
  state?: EmailDeliveryState | "all"
  q?: string
  limit?: number
  offset?: number
}

export interface DeliveryList {
  items: DeliveryListItem[]
  total: number
}

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
