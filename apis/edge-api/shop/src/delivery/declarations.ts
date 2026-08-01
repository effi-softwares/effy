// Service layer for a shop's same-day declaration (032 US2) — validation and orchestration. No HTTP,
// no SQL (Principle VI). Tests mock ./repository at the module boundary.
//
// ⚠ THE CENTRAL PROPERTY OF THIS FILE: SAVING HERE CHANGES NOTHING FOR ANY SHOPPER (FR-017).
// A declaration is a PROPOSAL. It has no effect until an admin approves it, and that is what makes
// US2 safe to ship on its own — not a consequence of the approval feature happening to be unbuilt.
// Nothing in this service may ever set a status; see submitDeclaration.
import * as repo from "./repository";
import {
  type CannotDeclareReason,
  DeclarationError,
  type DeclarationRefusalCode,
  type DeclarationView,
} from "./types";

const POSTCODE_RE = /^\d{4}$/;
const CUTOFF_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Can this shop declare at all, and if not, precisely why. */
async function locationGate(shopId: string): Promise<CannotDeclareReason | null> {
  const origin = await repo.shopOrigin(shopId);
  if (!origin.postcode) return "shop_location_required";
  // ⚠ THE SUBTLE ONE. The shop HAS a location; the platform just does not know where it is. Such a
  // shop passes the check above and then produces a null distance for every requested area at
  // approval time — so the admin decides blind, which is precisely the failure FR-023 exists to
  // prevent. Refusing here is the only place it can be caught before an approval screen full of
  // blanks. This is 031's live 3001 case (a real postcode no locality names) on a second surface.
  if (!origin.mappable) return "shop_location_unmappable";
  return null;
}

/** What the shop sees about itself: in force, pending, and the last decision — all three, always. */
export async function getDeclarations(shopId: string): Promise<DeclarationView> {
  const [reason, declarations] = await Promise.all([
    locationGate(shopId),
    repo.readDeclarations(shopId),
  ]);
  return {
    canDeclare: reason === null,
    // ⚠ Carried on the READ so the console can explain BEFORE an operator fills in a form and is
    // refused at the end of it.
    cannotDeclareReason: reason,
    ...declarations,
  };
}

/**
 * Submit a declaration. Creates a new PENDING version; any existing approved one stays in force.
 *
 * ⚠ `body` is untrusted. In particular a `status` field is IGNORED OUTRIGHT — never read, never
 * mapped, never validated-and-rejected. FR-021 says a shop cannot approve itself, and the strongest
 * form of that is a code path where the word has nowhere to go.
 */
export async function submitDeclaration(
  shopId: string,
  body: Record<string, unknown>,
  submittedBy: string,
): Promise<DeclarationView> {
  const reason = await locationGate(shopId);
  if (reason) {
    throw new DeclarationError(
      "unprocessable",
      reason === "shop_location_required"
        ? "this shop has no location recorded, so distance to a customer cannot be judged"
        : "this shop's postcode has no known location, so distance to a customer cannot be judged",
      reason,
    );
  }

  const offersSameday = body.offersSameday === true;
  const rawCutoff = typeof body.cutoffTime === "string" ? body.cutoffTime.trim() : "";
  const rawPostcodes = Array.isArray(body.postcodes) ? body.postcodes : [];
  const postcodes = [...new Set(rawPostcodes.filter((p): p is string => typeof p === "string").map((p) => p.trim()))];

  if (!offersSameday) {
    // ⚠ Turning same-day OFF must not silently keep a list of areas or a cutoff attached to it — the
    // schema forbids it, and two contradictory statements in one body should be refused where the
    // operator can see them, not by a constraint violation.
    if (postcodes.length > 0 || rawCutoff) {
      throw refuse(
        "areas_not_applicable",
        "same-day is switched off, so areas and a cutoff time do not apply — clear them, or switch same-day on",
      );
    }
    await repo.submitDeclaration(shopId, { offersSameday: false, cutoffTime: null, postcodes: [] }, submittedBy);
    return getDeclarations(shopId);
  }

  if (postcodes.length === 0) {
    throw refuse("areas_required", "choose at least one area this shop can reach the same day");
  }

  // ⚠ FR-030. "Same-day, no cutoff" is a promise nobody can keep, and it leaves the withdrawal rule
  // undecidable — the quote would have to choose between "never withdraw" and "never offer", and both
  // are wrong.
  if (!CUTOFF_RE.test(rawCutoff)) {
    throw refuse(
      "cutoff_required",
      "a same-day cutoff time is required (HH:mm) — after it, same-day is no longer offered for that day",
    );
  }

  const malformed = postcodes.filter((p) => !POSTCODE_RE.test(p));
  if (malformed.length > 0) {
    throw new DeclarationError("validation", "invalid postcode", undefined, [
      { field: "postcodes", message: `not a 4-digit postcode: ${malformed.join(", ")}` },
    ]);
  }

  // ⚠ A postcode no locality names is refused, not accepted-with-a-shrug. 031's 3001 entered a zone
  // through a field that validated a postcode's SHAPE and nothing else, and was found weeks later by
  // a hand-written query. The same field on a new surface would repeat it exactly.
  const unknown = await repo.unknownPostcodes(postcodes);
  if (unknown.length > 0) {
    throw refuse(
      "unknown_postcode",
      `no Australian locality uses ${unknown.join(", ")} — check the postcode, or choose the area by name`,
    );
  }

  await repo.submitDeclaration(shopId, { offersSameday: true, cutoffTime: rawCutoff, postcodes }, submittedBy);
  return getDeclarations(shopId);
}

function refuse(code: DeclarationRefusalCode, message: string): DeclarationError {
  return new DeclarationError("unprocessable", message, code);
}
