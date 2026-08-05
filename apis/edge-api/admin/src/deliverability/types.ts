/**
 * Email deliverability — the platform's record of which addresses it can actually reach
 * (037-platform-email-delivery).
 *
 * WHY THIS EXISTS AT ALL: when an address hard-fails once, the mail service records it and
 * thereafter ACCEPTS every send and delivers nothing — the caller gets a success response and a
 * message id. On a platform where an emailed code is the only credential for three of four
 * audiences, that is a permanent, silent, undetected account lockout. Nothing in the send path can
 * see it; only the per-message outcome stream can.
 */

import type { EmailDeliveryState } from "@effy/shared-types";

export type { EmailDeliveryState };

/** The outcome kinds the platform subscribes to. See contracts/ses-event.contract.md. */
export type DeliveryEventType =
  | "bounce"
  | "complaint"
  | "delivery"
  | "reject"
  | "delivery_delay";

export const DELIVERY_EVENT_TYPES: readonly DeliveryEventType[] = [
  "bounce",
  "complaint",
  "delivery",
  "reject",
  "delivery_delay",
] as const;

/**
 * One outcome, for one message, to one address — normalised off the wire.
 *
 * ⚠ `address` and `rawAddress` are BOTH carried, and the distinction is load-bearing. `address` is
 * lower-cased for lookup (matching `public.customer.email`, which is `citext` because Cognito treats
 * email as a case-insensitive sign-in alias). `rawAddress` is the exact bytes the mail service
 * reported, because its suppression-management API is CASE-SENSITIVE: a repair that normalises case
 * silently fails to remove an entry that demonstrably exists, and the operator believes they fixed
 * something they did not (FR-035).
 */
export interface DeliveryEvent {
  address: string;
  rawAddress: string;
  eventType: DeliveryEventType;
  /** `Permanent`/`Transient` plus the provider's sub-type, or the complaint feedback type. */
  subType: string | null;
  reason: string | null;
  /** ⚠ The receiving server's own text. Stored for operators; NEVER logged — it contains the address. */
  diagnostic: string | null;
  messageId: string;
  occurredAt: string;
}

/** The current conclusion for one address. One row per address ever heard about. */
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

/**
 * Who, if anyone, owns this address on the platform.
 *
 * ⚠ NULLABLE, and that is the honest answer rather than a defect. An address can bounce before its
 * account exists, after it is deleted, or for the DRIVER audience — which has a Cognito pool and no
 * platform table at all. Rendering "—" is correct; inventing an owner is not.
 */
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

export interface DeliveryEventDTO {
  eventType: DeliveryEventType;
  subType: string | null;
  messageId: string;
  occurredAt: string;
}

export interface DeliveryDetailDTO extends DeliveryListItemDTO {
  /** ⚠ Operator-only. Not in the list response and never in the customer's own account read. */
  diagnostic: string | null;
  lastMessageId: string | null;
  repairedBy: string | null;
  /**
   * Read LIVE from the mail service on every request — never stored.
   *
   * ⚠ `null` means "we could not check", and the console must say so. It must NEVER default to
   * `false`, which reads as "not suppressed" and is the more dangerous of the two lies. Two stored
   * sources of truth for one fact disagree eventually, and at that moment nobody can tell which is
   * lying — the same reasoning that made 027 count redemptions rather than store a counter.
   */
  suppressedInSes: boolean | null;
  events: DeliveryEventDTO[];
}

export interface DeliveryListParams {
  state: EmailDeliveryState | "all" | "problems";
  q: string | null;
  limit: number;
  offset: number;
}

export interface DeliveryListDTO {
  items: DeliveryListItemDTO[];
  total: number;
}

/** Domain failures, mapped to problem+json by handler-support. */
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

/** Max length of the operator's repair note. */
export const REPAIR_NOTE_MAX = 500;
