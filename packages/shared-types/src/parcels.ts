// Parcels: one bag or box of a package (one shop's share of an order), and how each is read and handed
// over. Bag 1's code is the package's own code. Every surface counts, scans and records parcels; "Bag n
// of N" counts this package's live bags only.

import type { WireInt } from "./cart";
import type { HandoverMethod } from "./driver";

export type ParcelZone = "ambient" | "chilled" | "frozen";

/** How a read was made. A bag ticked by hand is not a read: it is a hand-over with method `manual`. */
export type ReadMethod = "scan" | "typed";

/** What a read means, everywhere. `not_found` is decided by the server only. */
export type ReadOutcome =
  | "accepted"
  | "already_counted"
  | "belongs_elsewhere"
  | "not_on_this_work"
  | "voided"
  | "cancelled"
  | "not_a_label"
  | "not_found";

/** Why a bag was not handed over at a step. `other` needs a note. */
export type ParcelMissingReason = "not_at_shop" | "not_in_van" | "not_at_hub" | "damaged" | "wrong_temperature" | "other";

export const PARCEL_MISSING_REASON_WORDS: Record<ParcelMissingReason, string> = {
  not_at_shop: "Not at the shop",
  not_in_van: "Not in the van",
  not_at_hub: "Not at the hub",
  damaged: "Damaged",
  wrong_temperature: "Wrong temperature",
  other: "Other",
};

/** A parcel named by its id or by its label code (a scan reads a code). One of the two. */
export interface ParcelRef {
  parcelId?: string;
  parcelCode?: string;
}

export interface ParcelHandover extends ParcelRef {
  method: HandoverMethod;
}

export interface ParcelMissing extends ParcelRef {
  reason: ParcelMissingReason;
  note?: string | null;
}

/**
 * One read as the client made and judged it. `clientReadId` makes an offline replay record once;
 * `deviceAt` is when it happened on the device, kept however late it arrives.
 */
export interface LabelReadDTO {
  clientReadId: string;
  raw: string;
  method: ReadMethod;
  outcome: ReadOutcome;
  deviceAt: string;
  deviceId?: string | null;
  appVersion?: string | null;
  parcelCode?: string | null;
}

/** A live parcel as every surface sees it. `of` = this package's live bags. */
export interface ParcelDTO {
  parcelId: string;
  code: string;
  seq: WireInt;
  of: WireInt;
  zone: ParcelZone;
}

export const PARCEL_ZONE_WORDS: Record<ParcelZone, string> = {
  ambient: "Ambient",
  chilled: "Chilled",
  frozen: "Frozen",
};

/** Where a bag is, as a shop may be told: never a driver's name. */
export type ParcelCustody = "at_shop" | "packed" | "with_driver" | "with_courier" | "beyond";

export const PARCEL_CUSTODY_WORDS: Record<ParcelCustody, string> = {
  at_shop: "At shop",
  packed: "Packed",
  with_driver: "With driver",
  with_courier: "With courier",
  beyond: "Left the shop",
};

/** The hard limit on bags per package. */
export const MAX_PARCELS = 50;

/** Where a bag is, from its latest hand-over step, for the shop console and back-office: never a driver's name, never past "beyond". */
export function parcelCustodyOf(lastStep: string | null): ParcelCustody {
  if (lastStep === null) return "at_shop"
  if (lastStep === "pack") return "packed"
  if (lastStep === "collect") return "with_driver"
  if (lastStep === "courier_handover" || lastStep === "shop_pickup") return "with_courier"
  return "beyond"
}

/** `GET /orders/v1/admin/lookup?q=`: what a scanned label, typed code or order number names, so back-office opens that order with it highlighted. */
export interface AdminLookupDTO {
  orderId: string
  orderNumber: string
  /** The package (shop portion) the bag belongs to; absent for an order-number match. */
  fulfillmentId?: string
  parcelId?: string
  /** A voided or withdrawn bag is still found, so staff see why it no longer scans. */
  voided?: boolean
  cancelled?: boolean
}

/** Where a bag goes once in the hub (the words the driver's hub scan shows). */
export interface HubSortDTO {
  kind: "load_now" | "shelve" | "courier_bay"
  label: string
}

/** One bag the hub expects from a collection run. */
export interface HubBagDTO {
  parcelId: string
  code: string
  seq: number
  of: number
  zone: ParcelZone
  orderNumber: string
  checkedIn: boolean
  sort: HubSortDTO
}

/** `GET /fleet/v1/hub/expected`: the collection runs whose bags are on their way in. */
export interface HubExpectedDTO {
  runs: Array<{ runId: string; driverName: string; bags: HubBagDTO[] }>
}

/** `POST /fleet/v1/hub/checkins`: each read's result, in the scan rule's words. */
export interface HubCheckinResultDTO {
  clientReadId: string
  outcome: ReadOutcome
  /** "Bag 2 of 3", or the refusal in the scan rule's words. */
  words: string
  code: string | null
  sort?: HubSortDTO
  orderNumber?: string
  zone?: ParcelZone
  /** This scan completed its run: the run is checked in and closed. */
  runClosed: boolean
}

export interface HubCheckinsResponseDTO {
  results: HubCheckinResultDTO[]
}

/** How hand-overs were made in a period. */
export interface HandoverMixDTO {
  scan: number
  typed: number
  manual: number
}

/**
 * `GET /fleet/v1/reports/handovers?from&to` (Melbourne dates, inclusive): how bags were handed over and
 * what went wrong. Staff only. An exception is a refused read (a repeat scan is not one) or a bag
 * declared missing; `exceptionsPer1000` is per 1,000 hand-overs, null when there were none.
 */
export interface HandoverReportDTO {
  from: string
  to: string
  overall: HandoverMixDTO
  byShop: Array<HandoverMixDTO & { shopId: string; shopName: string }>
  byDriver: Array<HandoverMixDTO & { driverId: string; driverName: string }>
  /** Shop staff (pack, courier) and hub staff (check-in) hand-overs, apart from drivers'. */
  byActor: Array<HandoverMixDTO & { actor: "driver" | "shop_staff" | "admin_staff" }>
  refused: Array<{ outcome: ReadOutcome; surface: "driver_app" | "shop_web" | "back_office"; count: number }>
  missing: Array<{ reason: ParcelMissingReason; count: number }>
  exceptions: number
  exceptionsPer1000: number | null
  /** Reads the phone judged one way and the server another (a bag voided while offline). */
  disagreements: number
}
