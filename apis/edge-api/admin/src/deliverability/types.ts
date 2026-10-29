import type { ListPage } from "@effy/shared-types";
/**
 * Which addresses the platform can actually reach. After a hard failure SES accepts every send and
 * delivers nothing, a silent lockout when an emailed code is the only credential; only the outcome
 * stream shows it.
 */

import type { EmailDeliveryState } from "@effy/shared-types";

export type { EmailDeliveryState };

export type DeliveryEventType =
  | "bounce"
  | "complaint"
  | "delivery"
  | "reject"
  | "delivery_delay";

/** `address` is lower-cased for lookup; `rawAddress` keeps the exact bytes for the case-sensitive suppression API. */
export interface DeliveryEvent {
  address: string;
  rawAddress: string;
  eventType: DeliveryEventType;
  /** `Permanent`/`Transient` plus the sub-type, or the complaint feedback type. */
  subType: string | null;
  reason: string | null;
  /** The receiving server's text, for operators; never logged (it contains the address). */
  diagnostic: string | null;
  messageId: string;
  /** The `effy-template` tag; null for Cognito-sent mail. */
  templateId: string | null;
  occurredAt: string;
}

/** One row per address ever heard about. */
export interface DeliveryStatusRow {
  address: string;
  rawAddress: string;
  state: EmailDeliveryState;
  reason: string | null;
  diagnostic: string | null;
  lastEventAt: string;
  lastMessageId: string | null;
  bounceCount: number;
  complaintCount: number;
  repairedAt: string | null;
  repairedBy: string | null;
}

/** null legitimately: before an account exists, after deletion, or a driver (no platform table). */
export type SubjectKind = "customer" | "shop_staff" | "admin_staff";

export interface DeliverySubject {
  kind: SubjectKind;
  id: string;
  name: string | null;
}

export interface DeliveryListItemDTO {
  address: string;
  state: EmailDeliveryState;
  reason: string | null;
  lastEventAt: string;
  bounceCount: number;
  complaintCount: number;
  repairedAt: string | null;
  subject: DeliverySubject | null;
}

export interface DeliveryDetailDTO extends DeliveryListItemDTO {
  /** Operator-only: not in the list response or the customer's account read. */
  diagnostic: string | null;
  lastMessageId: string | null;
  repairedBy: string | null;
  /** Read live, never stored. `null` means "could not check" and must never default to false. */
  suppressedInSes: boolean | null;
}

/** A console list page (103). */
export type DeliveryListDTO = ListPage<DeliveryListItemDTO>;

export type DeliverabilityErrorKind = "not_found" | "validation" | "unavailable";

export class DeliverabilityError extends Error {
  constructor(
    readonly kind: DeliverabilityErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "DeliverabilityError";
  }
}

export const REPAIR_NOTE_MAX = 500;
