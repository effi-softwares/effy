// Per-area delivery configuration (031 US2/US3) — the service layer between an admin's decision and
// the offering grid that checkout reads.
//
// ⚠ THE SHAPE OF THIS FEATURE. Operations thinks "what does Ballarat get?"; the platform stores
// "what does MEL-METRO → REGIONAL get, per method?". With two zones that is four pairs and it is
// fine. With ten it is ninety pairs across three methods, and nobody can answer the question they
// actually have. Worse, the per-origin dimension expresses a distinction NO SHOPPER CAN PERCEIVE,
// because they never learn which shop fulfils their order.
//
// So the decision moves to the area, and this file projects it onto the grid. ⚠ The grid stays
// authoritative — `checkout/quote.go` reads it unchanged and NOTHING in core-api moves (FR-028).
import { DELIVERY_METHODS, DeliveryError } from "./types";
import type { Area, AreaServiceLevel, AreaShopFeasibility } from "./types";
import { postcodeCoverage } from "./localities";
import * as repo from "./repository";

const POSTCODE_RE = /^[0-9]{4}$/;

/** Everything one area gets, in a single read (FR-022). */
export async function getArea(zoneId: string, postcode: string): Promise<Area> {
  if (!POSTCODE_RE.test(postcode)) {
    throw new DeliveryError("validation", "invalid postcode", [
      { field: "postcode", message: "must be a 4-digit postcode" },
    ]);
  }
  const zone = await repo.readZone(zoneId);
  if (!zone) throw new DeliveryError("not_found", "zone not found");

  const [coverage, decision, levels, siblings, shops] = await Promise.all([
    postcodeCoverage(postcode),
    repo.getAreaDecision(zoneId, postcode),
    repo.areaServiceLevels(zoneId),
    repo.zonePostcodes(zoneId),
    repo.shopsForArea(zoneId),
  ]);

  const byMethod = new Map(levels.map((l) => [l.method, l]));
  const serviceLevels: AreaServiceLevel[] = DELIVERY_METHODS.map((method) => {
    const found = byMethod.get(method);
    return {
      method,
      enabled: found?.enabled ?? false,
      feeAmount: found?.feeAmount ?? null,
      leadDaysMin: found?.leadDaysMin ?? null,
      leadDaysMax: found?.leadDaysMax ?? null,
      sameDayCutoff: found?.sameDayCutoff ?? null,
    };
  });

  return {
    zoneId,
    zoneCode: zone.code,
    postcode,
    places: coverage.places.map((p) => ({ name: p.name, state: p.state })),
    // ⚠ THE THREE STATES. `unconfigured` is the ABSENCE of a decision and of any active offering —
    // it is never a stored value, because encoding it would create two ways to say one thing.
    state:
      decision?.decision === "not_served"
        ? "not_served"
        : decision || serviceLevels.some((l) => l.enabled)
          ? "configured"
          : "unconfigured",
    decision,
    serviceLevels,
    // ⚠ The other areas this zone covers. Configuring one configures all of them.
    siblingPostcodes: siblings.filter((p) => p !== postcode),
    shops,
  };
}

/** Shops that could serve this area — the input to the same-day judgement (FR-017). */
export async function areaShops(zoneId: string): Promise<AreaShopFeasibility[]> {
  return repo.shopsForArea(zoneId);
}

/* ── ⚠ configureArea / the per-area pricing projection was REMOVED (2026-08-01) ────────────────
 *
 * 031 collapsed per-origin pricing into one fee per area, on the reasoning that a shopper cannot
 * perceive which shop serves them. That reasoning still holds FOR PRICE.
 *
 * It does not hold for ELIGIBILITY, and that is what broke it. Whether same-day is possible depends
 * entirely on which shop is fulfilling — so the origin dimension this collapse removed is exactly the
 * axis the next design is built on: a shop declares which zones it will serve same-day, and an admin
 * approves it.
 *
 * ⚠ The same-day guard went with it, and deserves its own note. It asked "is any shop's postcode in
 * this area's zone?" and treated yes as "a shop is nearby". Live data disproved it: same-day to
 * BALLARAT was permitted because a shop in BENDIGO shares zone REGIONAL — **98 km away**, essentially
 * as far as Melbourne (107 km). The heuristic was not merely crude; here it carried no information.
 *
 * ⚠ Research R6 justified that crudeness with "the platform has no routing or distance capability".
 * That was wrong: G-NAF ships LOCALITY_POINT with a latitude and longitude per locality, in the same
 * download and under the same licence 030 already accepted. The 030 derivation simply discarded it.
 * Distance is available; it was never loaded.
 *
 * What survives here: reading what an area currently gets, and recording a deliberate decision not to
 * serve it. Both are orthogonal to how a fee is calculated.
 */

/**
 * Mark an area deliberately not served (FR-011/FR-011a).
 *
 * ⚠ THIS WITHDRAWS THE AREA, IT DOES NOT ONLY ANNOTATE IT. Serviceability is decided by zone
 * membership, so a decision recorded BESIDE that membership would leave the storefront still
 * answering "we deliver here" for an area an admin explicitly marked unserved — the REGIONAL defect
 * inverted, introduced by the feature meant to prevent it. The repository does both in one
 * transaction; the decision survives the withdrawal so provenance is kept (FR-011b/FR-011c).
 */
export async function markAreaNotServed(
  zoneId: string,
  postcode: string,
  input: { note?: unknown },
  actorSub: string,
): Promise<void> {
  if (!POSTCODE_RE.test(postcode)) {
    throw new DeliveryError("validation", "invalid postcode", [
      { field: "postcode", message: "must be a 4-digit postcode" },
    ]);
  }
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
  await repo.recordAreaDecision(zoneId, postcode, "not_served", note, actorSub);
}
