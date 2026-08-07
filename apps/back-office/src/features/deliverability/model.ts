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
  /** ⚠ Nullable, and legitimately so — see the console's own note in DeliverabilityListScreen. */
  subject: DeliverySubject | null;
}

export interface DeliveryEvent {
  eventType: "bounce" | "complaint" | "delivery" | "reject" | "delivery_delay";
  subType: string | null;
  messageId: string;
  /**
   * ⚠ The template this outcome belongs to (038). `null` means the message was sent by Cognito
   * (sign-up, password reset, verification, MFA — which cannot be tagged) or predates 038. The
   * console renders that as "Cognito / pre-038", NOT as blank or unknown — a null here is an answer,
   * not a gap, and the same honesty the screen already applies to `subject` and `suppressedInSes`.
   */
  templateId: string | null;
  occurredAt: string;
}

export interface DeliveryDetail extends DeliveryListItem {
  diagnostic: string | null;
  lastMessageId: string | null;
  repairedBy: string | null;
  /** ⚠ `null` means "we could not check" — it must never be rendered as "not suppressed". */
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
 * What the state MEANS for the person — the sentence a CSA reads out.
 *
 * ⚠ The undeliverable line names the consequence, not the mechanism. "On a suppression list" is true
 * and useless to whoever is on the phone.
 */
export const STATE_MEANING: Record<EmailDeliveryState, string> = {
  reachable: "Messages are being delivered.",
  soft_failing: "Recent messages could not be delivered. This often clears on its own.",
  undeliverable:
    "Messages are permanently rejected. This person receives NO sign-in codes — for driver, shop and back-office that means they cannot sign in at all.",
  complained:
    "A message was reported as spam. Recorded for context; it does NOT bar them from signing in.",
};
