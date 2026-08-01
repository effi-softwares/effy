// Operator-side locality lookup (031 US1). The back-office half of what 030 gave the shopper.
//
// ⚠ WHY THIS EXISTS RATHER THAN A CALL TO core-api. The storefront already has
// `GET /v1/storefront/localities`, and reusing it would be the obvious move — but `core-api` has NO
// cloud deployment. It runs on a laptop; this Lambda runs in AWS. The console would work locally and
// break in dev, and an operator console would depend on the customer hot path being up.
//
// Same table, two services, two paths — the split `promo_code` already has (Home read → hot path;
// advertising a promotion → cold path, feature 028). Principle III is satisfied without an exception,
// and Principle II is satisfied because the *contract* is shared: `LocalityDTO` is reused unchanged.
import { DeliveryError } from "./types";
import * as repo from "./repository";

/** Bounded so an operator's list stays scannable. Higher than the shopper's 8 — a console has room. */
const LOCALITY_LIMIT = 20;

/** Below this there is nothing worth asking the database. */
const MIN_QUERY = 2;

const POSTCODE_RE = /^[0-9]{4}$/;

export interface LocalityResult {
  name: string;
  state: string;
  postcode: string;
}

/**
 * Find places an operator could mean.
 *
 * Accepts either a postcode or a name prefix — the SERVER classifies it, so no caller has to decide
 * what it is holding first.
 */
export async function searchLocalities(q: unknown): Promise<LocalityResult[]> {
  const raw = typeof q === "string" ? q.trim() : "";
  if (raw.length < MIN_QUERY) {
    throw new DeliveryError("validation", "query too short", [
      { field: "q", message: `must be at least ${MIN_QUERY} characters` },
    ]);
  }
  if (POSTCODE_RE.test(raw)) return repo.localitiesForPostcode(raw);
  return repo.searchLocalities(raw, LOCALITY_LIMIT);
}

export interface PostcodeCoverage {
  postcode: string;
  places: LocalityResult[];
  count: number;
}

/**
 * What a postcode actually covers — ⚠ THE DATA BEHIND FR-006, and the reason this feature is not just
 * a nicer input box.
 *
 * Serviceability is decided by postcode. Postcode 3350 covers **20** Ballarat localities and 3550
 * covers **12** in Bendigo, so an admin choosing "Alfredton" is choosing all twenty. Without this
 * being said out loud before they confirm, they believe they made a narrow decision and made a broad
 * one — and the only evidence otherwise is an order from a suburb they never meant to serve. There is
 * no error, no log line, no alert.
 *
 * ⚠ `count` is returned even though the caller could take `places.length`: the disclosure sentence is
 * built from it, and a client measuring a list it was handed can say "1 other place" when there are
 * twenty because the list was truncated.
 *
 * ⚠ An EMPTY result is meaningful, not an error: it means no locality names this postcode — the 3001
 * case, a PO-box code with no street addresses. The caller warns; it does not refuse.
 */
export async function postcodeCoverage(postcode: unknown): Promise<PostcodeCoverage> {
  const raw = typeof postcode === "string" ? postcode.trim() : "";
  if (!POSTCODE_RE.test(raw)) {
    throw new DeliveryError("validation", "invalid postcode", [
      { field: "postcode", message: "must be a 4-digit postcode" },
    ]);
  }
  const places = await repo.localitiesForPostcode(raw);
  return { postcode: raw, places, count: places.length };
}
