// Pure ring-suggestion math (047 FR-015): straight-line distance from Effy's hub to a zone's
// representative point, mapped to a distance ring. No I/O — unit-testable. The suggestion is advisory;
// the admin's chosen ring always wins (FR-016), and distance never reaches a shopper (FR-018).

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

// haversineKm is the great-circle distance between two lat/lng points, in kilometres.
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface SuggestRing {
  id: string;
  suggestUpperKm: number | null; // null = the open-ended (furthest) ring
}

// ringForDistance picks the ring whose band `km` falls in: the smallest suggestUpperKm ≥ km, or — if km
// exceeds every bounded ring — the open-ended (null) ring. Returns null only if no ring exists at all.
export function ringForDistance(km: number, rings: SuggestRing[]): string | null {
  const bounded = rings
    .filter((r): r is SuggestRing & { suggestUpperKm: number } => r.suggestUpperKm != null)
    .sort((a, b) => a.suggestUpperKm - b.suggestUpperKm);
  for (const r of bounded) {
    if (km <= r.suggestUpperKm) return r.id;
  }
  const openEnded = rings.find((r) => r.suggestUpperKm == null);
  if (openEnded) return openEnded.id;
  return bounded.length > 0 ? bounded[bounded.length - 1]!.id : null;
}
