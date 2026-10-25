// Domain shapes for the deliverability slice. The API contracts double as the domain shapes here
// (identity map in repo.ts), matching the shops slice.

export type EmailDeliveryState = "reachable" | "soft_failing" | "undeliverable" | "complained";

export interface DeliverySubject {
  kind: "customer" | "shop_staff" | "admin_staff";
  id: string;
  name: string | null;
}

export interface DeliveryListItem {
  address: string;
  state: EmailDeliveryState;
  reason: string | null;
  lastEventAt: string;
  bounceCount: number;
  complaintCount: number;
  repairedAt: string | null;
  /** Nullable, and legitimately so — see the console's own note in DeliverabilityListScreen. */
  subject: DeliverySubject | null;
}

export interface DeliveryEvent {
  eventType: "bounce" | "complaint" | "delivery" | "reject" | "delivery_delay";
  subType: string | null;
  messageId: string;
  /**
   * The template this outcome belongs to. `null` means Cognito sent it (sign-up, reset, verification, MFA:
   * untaggable), rendered as "Cognito", not blank.
   */
  templateId: string | null;
  occurredAt: string;
}

export interface DeliveryDetail extends DeliveryListItem {
  diagnostic: string | null;
  lastMessageId: string | null;
  repairedBy: string | null;
  /** `null` means "we could not check" — it must never be rendered as "not suppressed". */
  suppressedInSes: boolean | null;
  events: DeliveryEvent[];
}

export interface DeliveryListParams {
  state?: EmailDeliveryState | "all";
  q?: string;
  limit?: number;
  offset?: number;
}

export interface DeliveryList {
  items: DeliveryListItem[];
  total: number;
}

/** Human copy for each state. One map, so the list and the detail can never disagree. */
export const STATE_LABEL: Record<EmailDeliveryState, string> = {
  reachable: "Reachable",
  soft_failing: "Having trouble",
  undeliverable: "Undeliverable",
  complained: "Reported as spam",
};

/**
 * What the state means for the person — the sentence a CSA reads out.
 *
 * The undeliverable line names the consequence, not the mechanism. "On a suppression list" is true
 * and useless to whoever is on the phone.
 */
export const STATE_MEANING: Record<EmailDeliveryState, string> = {
  reachable: "Emails to this address are being delivered normally, with no problems recorded.",
  soft_failing: "Recent emails to this address bounced; this often clears up on its own.",
  undeliverable:
    "Emails are permanently rejected, so this person cannot receive sign-in codes.",
  complained:
    "An email was reported as spam; this does not stop them signing in.",
};
