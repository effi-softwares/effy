// Domain types for a shop's SAME-DAY DECLARATION (032). Wire DTOs live in @effy/shared-types and are
// mapped explicitly in the handlers; these never leak wire concerns (Principle VI).
//
// ⚠ WHAT IS DELIBERATELY ABSENT FROM THIS WHOLE SLICE: any notion of a delivery FEE.
// A shop declares where it can physically reach today; what a shopper pays is the platform's decision
// (FR-008), and there is no pricing route on this service at any verb. The guarantee is the route
// topology, not a check in this file.

/**
 * ⚠ FIVE states, and `revoked` / `superseded` are NOT the same value.
 *
 * An admin withdrawing a shop's same-day service and a shop's own newer declaration being approved
 * both end an approval — but a shop reading its history has to be able to tell "they took this away
 * from us" from "our update went live". `superseded` is set by the platform and carries no note;
 * `revoked` is set by a person and requires one.
 */
export type DeclarationStatus = "pending" | "approved" | "declined" | "revoked" | "superseded";

/** One area a shop will serve same-day. ⚠ AN AREA IS A POSTCODE — see the note on Declaration. */
export interface DeclarationArea {
  postcode: string;
  /** Every locality this postcode covers — the disclosure data, not decoration. */
  places: string[];
  localityCount: number;
}

/**
 * One version of a shop's declaration.
 *
 * ⚠ VERSIONS ARE APPEND-ONLY. FR-018 requires an approved declaration to stay IN FORCE while a change
 * to it is pending, and a status column on one mutable row cannot hold both — so an edit would
 * silently revoke a live approval, and a shop changing its cutoff would stop its own same-day service
 * with nothing reporting it.
 *
 * ⚠ AN AREA IS A POSTCODE, chosen by locality name. Serviceability is postcode-decided everywhere on
 * this platform, so picking "Alfredton" commits the shop to all TWENTY Ballarat localities. That is
 * why `places`/`localityCount` travel with every area: the console has to say so BEFORE the shop
 * confirms, or the shop believes it made a narrow commitment when it made a broad one.
 */
export interface Declaration {
  id: string;
  shopId: string;
  offersSameday: boolean;
  /**
   * Wall-clock cutoff in Australia/Melbourne. ⚠ Required whenever `offersSameday` is true: "same-day,
   * no cutoff" is a promise nobody can keep, and it makes the withdrawal rule undecidable.
   */
  cutoffTime: string | null;
  status: DeclarationStatus;
  areas: DeclarationArea[];
  submittedBy: string;
  submittedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

/**
 * What a shop sees about itself.
 *
 * ⚠ `inForce` AND `pending` are BOTH present and both real. A single "current declaration" field
 * would force this API to choose which truth to tell, and whichever it chose the other would be
 * invisible — the shop would either think a pending edit was already live, or think an approved one
 * had been lost.
 */
export interface DeclarationView {
  canDeclare: boolean;
  cannotDeclareReason: CannotDeclareReason | null;
  inForce: Declaration | null;
  pending: Declaration | null;
  lastDecision: Declaration | null;
}

/**
 * ⚠ TWO location refusals, not one, and the second is the subtle one.
 *
 * `shop_location_required` — the shop has no postcode at all.
 * `shop_location_unmappable` — it HAS a postcode, but that postcode has no known coordinates. Such a
 * shop passes the first check and then reports `straightLineKm: null` for every requested area at
 * approval time, so FR-023's entire purpose — showing an admin how far each area actually is —
 * evaporates with nothing reporting a problem. This is 031's live 3001 case (a real postcode that no
 * locality names) reaching a second surface.
 */
export type CannotDeclareReason = "shop_location_required" | "shop_location_unmappable";

/** What a shop submits. ⚠ No status field — FR-021: a shop cannot approve itself, even by asking. */
export interface DeclarationInput {
  offersSameday: boolean;
  cutoffTime: string | null;
  postcodes: string[];
}

// ⚠ No "not_found": a shop always has exactly one declaration history, possibly empty. There is no
// id in any of these routes for a caller to get wrong.
export type DeclarationErrorKind = "validation" | "unprocessable" | "forbidden";

/**
 * Stable refusal codes. ⚠ "Invalid" tells a shop operator nothing about which of six rules they broke,
 * and several of these fail silently: declaring same-day with no cutoff would make the withdrawal
 * rule undecidable, and an unmappable location would produce an approval screen full of blanks.
 */
export type DeclarationRefusalCode =
  | CannotDeclareReason
  | "unknown_postcode"
  | "areas_required"
  | "cutoff_required"
  | "areas_not_applicable";

export interface FieldIssue {
  field: string;
  message: string;
}

export class DeclarationError extends Error {
  constructor(
    readonly kind: DeclarationErrorKind,
    message: string,
    readonly code?: DeclarationRefusalCode,
    readonly fields?: FieldIssue[],
  ) {
    super(message);
    this.name = "DeclarationError";
  }
}

export function isDeclarationError(err: unknown): err is DeclarationError {
  return err instanceof DeclarationError;
}
