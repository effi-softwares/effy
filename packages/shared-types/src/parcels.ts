// 096 — parcels: one physical bag or box of a package, and how each is read and handed over.
//
// A PACKAGE is one shop's share of one order (089). A PARCEL is one bag of it. Parcel 1's code is the
// package's own 089 code, so a label printed before 096 is simply bag 1 (research R1). Every surface
// counts, scans and records PARCELS; "Bag n of N" counts this package's live bags only.

import type { WireInt } from "./cart";
import type { HandoverMethod } from "./driver";

export type ParcelZone = "ambient" | "chilled" | "frozen";

/** How a read was made. A bag ticked by hand is not a read: it is a hand-over with method `manual`. */
export type ReadMethod = "scan" | "typed";

/** What a read means, everywhere (FR-052). `not_found` is decided by the server only. */
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

/** Where a bag is, as a shop may be told: never a driver's name (073). */
export type ParcelCustody = "at_shop" | "packed" | "with_driver" | "with_courier" | "beyond";

export const PARCEL_CUSTODY_WORDS: Record<ParcelCustody, string> = {
  at_shop: "At shop",
  packed: "Packed",
  with_driver: "With driver",
  with_courier: "With courier",
  beyond: "Left the shop",
};

/** The hard limit on bags per package (research R3). */
export const MAX_PARCELS = 50;

/**
 * 096 — where a bag is, from its latest recorded hand-over step. ONE mapping for the shop console and
 * back-office: never a driver's name, never past "beyond" (the shop's view ends when the bag leaves).
 */
export function parcelCustodyOf(lastStep: string | null): ParcelCustody {
  if (lastStep === null) return "at_shop"
  if (lastStep === "pack") return "packed"
  if (lastStep === "collect") return "with_driver"
  if (lastStep === "courier_handover" || lastStep === "shop_pickup") return "with_courier"
  return "beyond"
}

/**
 * 096 US5 — `GET /orders/v1/admin/lookup?q=`: what a scanned label, a typed code or an order number
 * names, so back-office opens that order with the bag (or package) highlighted.
 */
export interface AdminLookupDTO {
  orderId: string
  orderNumber: string
  /** The package (shop portion) the bag belongs to; absent for an order-number match. */
  fulfillmentId?: string
  parcelId?: string
  /** A voided or withdrawn bag is still found — staff need to see why it no longer scans. */
  voided?: boolean
  cancelled?: boolean
}

/** 096 US5 — where a bag goes once it is in the hub (the same words the driver's hub scan shows). */
export interface HubSortDTO {
  kind: "load_now" | "shelve" | "courier_bay"
  label: string
}

/** 096 US5 — one bag the hub expects from a collection run. */
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

/** 096 US5 — `GET /fleet/v1/hub/expected`: the collection runs whose bags are on their way in. */
export interface HubExpectedDTO {
  runs: Array<{ runId: string; driverName: string; bags: HubBagDTO[] }>
}

/** 096 US5 — `POST /fleet/v1/hub/checkins` → each read's result, in the scan rule's words. */
export interface HubCheckinResultDTO {
  clientReadId: string
  outcome: ReadOutcome
  /** "Bag 2 of 3", or the refusal in the scan rule's words. */
  words: string
  code: string | null
  sort?: HubSortDTO
  orderNumber?: string
  zone?: ParcelZone
  /** The scan of this bag completed its run: the run is checked in and closed. */
  runClosed: boolean
}

export interface HubCheckinsResponseDTO {
  results: HubCheckinResultDTO[]
}

/** 096 US6 — how hand-overs were made in a period. */
export interface HandoverMixDTO {
  scan: number
  typed: number
  manual: number
}

/**
 * 096 US6 — `GET /fleet/v1/reports/handovers?from&to` (Melbourne dates, inclusive): how bags were
 * handed over and what went wrong. Staff only; never shown to a shop or a customer (FR-064).
 *
 * ⚠ AN EXCEPTION is a refused read (a repeat scan — "already counted" — is not one) or a bag declared
 * missing. `exceptionsPer1000` is exceptions per 1,000 hand-overs; null when there were none.
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
  /** Reads the phone judged one way and the server another (a bag voided while it was offline). */
  disagreements: number
}
