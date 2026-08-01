// Great-circle distance for the approval screen (032 US3) — PURE arithmetic, no SQL and no HTTP, so
// the numbers SC-008 turns on are testable without a database (Principle VI).
//
// ⚠ Its own module rather than a helper inside the repository: the repository is what the approval
// tests MOCK, and a pure function living inside a mocked module cannot be tested at all without
// unmocking it — which then breaks every other test in the file. Found exactly that way.

const EARTH_RADIUS_KM = 6371.0088;

/**
 * Great-circle distance, or NULL when either end is unknown.
 *
 * ⚠ RETURNS NULL, NEVER 0, for an unknown point. A zero would put the area next door to the shop on
 * the one screen whose entire purpose is to show an admin how far away it is — the most dangerous
 * possible default, because it argues for approval.
 *
 * ⚠ Straight-line, and the field is named so. Melbourne→Ballarat is ~102 km straight and ~115 km by
 * road. A routing provider was rejected in 030 and again here: an external dependency on a
 * customer-facing price path, where an outage would stop checkout quoting at all.
 *
 * Mirrors apis/core-api/internal/platform/delivery/distance.go. ⚠ Two implementations of one formula
 * is a real duplication, accepted because the alternative is the cold path calling the hot path — and
 * core-api has no cloud deployment, so that would work locally and fail in dev.
 */
export function greatCircleKm(
  aLat: number | null,
  aLon: number | null,
  bLat: number | null,
  bLon: number | null,
): number | null {
  if (aLat === null || aLon === null || bLat === null || bLon === null) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLat = lat2 - lat1;
  const dLon = toRad(bLon - aLon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
  return Math.round(km * 10) / 10;
}
