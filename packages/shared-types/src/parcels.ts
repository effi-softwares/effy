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
