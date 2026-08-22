// Service for the delivery fee-plan + ring config (047). Validation + orchestration; no SQL, no HTTP.
// ⚠ This surface VALIDATES a plan but never computes a customer fee — the fee engine's one home is the
// Go hot path. The value here is the activation completeness gate (FR-051/SC-016) and the a≥b / step
// invariants surfaced as friendly field errors before they ever reach a DB CHECK.
import * as repo from "./repository";
import { haversineKm, ringForDistance } from "./suggest";
import {
  DeliveryError,
  type FeePlan, type NewFeePlan, type NewRing, type NewZone, type PostcodeCheck,
  type RemovalImpact, type Ring, type RingSuggestion, type Settings, type Zone, type ZonePatch,
} from "./types";

// centsOf parses a 2-dp decimal string to integer cents ("6.00" → 600); milliOf parses a 3-dp factor
// ("1.8" → 1800). Integer math keeps the step-multiple and a≥b checks exact.
function centsOf(s: string): number {
  const t = (s ?? "").trim();
  const neg = t.startsWith("-");
  const [w, f = ""] = (neg ? t.slice(1) : t).split(".");
  const cents = (parseInt(w || "0", 10) || 0) * 100 + (parseInt((f + "00").slice(0, 2), 10) || 0);
  return neg ? -cents : cents;
}

function milliOf(s: string): number {
  const t = (s ?? "").trim();
  const neg = t.startsWith("-");
  const [w, f = ""] = (neg ? t.slice(1) : t).split(".");
  const milli = (parseInt(w || "0", 10) || 0) * 1000 + (parseInt((f + "000").slice(0, 3), 10) || 0);
  return neg ? -milli : milli;
}

function invalid(msg: string): DeliveryError {
  return new DeliveryError("invalid_plan", msg);
}

export async function listRings(): Promise<Ring[]> {
  return repo.listRings();
}

export async function createRing(input: NewRing, sub: string): Promise<Ring> {
  if (!input.code?.trim()) throw invalid("ring code is required");
  if (!input.name?.trim()) throw invalid("ring name is required");
  if (!Number.isInteger(input.ordinal) || input.ordinal <= 0) throw invalid("ordinal must be a positive integer");
  if (input.suggestUpperKm != null && Number(input.suggestUpperKm) <= 0) {
    throw invalid("suggested upper km must be greater than 0");
  }
  return repo.createRing(input, sub);
}

export async function listPlans(): Promise<FeePlan[]> {
  return repo.listPlans();
}

export async function createPlan(input: NewFeePlan, sub: string): Promise<FeePlan> {
  validatePlanValues(input);
  return repo.createPlan(input, sub);
}

// validatePlanValues mirrors the DB CHECKs as friendly field errors: a≥b (FR-022), cap/floor are
// multiples of the step so every fee lands on the grid (SC-005), cap≥floor, all positive.
function validatePlanValues(input: NewFeePlan): void {
  if (!input.name?.trim()) throw invalid("plan name is required");
  const step = centsOf(input.roundingStep);
  const floor = centsOf(input.floorAmount);
  const cap = centsOf(input.capAmount);
  if (step <= 0) throw invalid("rounding step must be greater than 0");
  if (cap <= 0) throw invalid("cap must be greater than 0");
  if (floor < 0) throw invalid("floor cannot be negative");
  if (cap % step !== 0) throw invalid("cap must be a multiple of the rounding step");
  if (floor % step !== 0) throw invalid("floor must be a multiple of the rounding step");
  if (cap < floor) throw invalid("cap must be at least the floor");
  const same = milliOf(input.sameDayFactor);
  const std = milliOf(input.standardFactor);
  if (same <= 0 || std <= 0) throw invalid("delivery-type factors must be greater than 0");
  if (same < std) throw invalid("same-day factor must be at least the standard factor");
}

// activatePlan enforces the completeness gate (FR-051/SC-016): every ACTIVE ring must be priced and the
// plan must have at least one weight band, so a served zone can never answer "no price". Refused with the
// gap named. On success exactly one plan is active (the partial-unique index is the second guard).
export async function activatePlan(planId: string, sub: string): Promise<FeePlan> {
  if (!(await repo.planExists(planId))) {
    throw new DeliveryError("plan_not_found", "plan not found");
  }
  const [rings, priced, bandCount] = await Promise.all([
    repo.activeRings(),
    repo.planPricedRingIds(planId),
    repo.planWeightBandCount(planId),
  ]);
  const missingRings = rings.filter((r) => !priced.has(r.id)).map((r) => r.code);
  if (missingRings.length > 0 || bandCount === 0) {
    const parts: string[] = [];
    if (missingRings.length > 0) parts.push(`price these rings: ${missingRings.join(", ")}`);
    if (bandCount === 0) parts.push("add at least one weight band");
    throw new DeliveryError("plan_incomplete", `cannot activate — ${parts.join("; ")}`, {
      missingRings,
      ...(bandCount === 0 ? { reason: "no_weight_bands" } : {}),
    });
  }
  await repo.activatePlan(planId, sub);
  return (await repo.readPlan(planId))!;
}

// ── Zones & serviceability (047) ──────────────────────────────────────────────────────────────────

function normalizePostcode(s: string): string {
  const t = (s ?? "").trim();
  if (!/^[0-9]{4}$/.test(t)) throw new DeliveryError("invalid_zone", "postcode must be exactly 4 digits");
  return t;
}

export async function listZones(): Promise<Zone[]> {
  return repo.listZones();
}

export async function createZone(input: NewZone, sub: string): Promise<Zone> {
  if (!input.code?.trim()) throw new DeliveryError("invalid_zone", "zone code is required");
  if (!input.name?.trim()) throw new DeliveryError("invalid_zone", "zone name is required");
  if (!input.ringId?.trim()) throw new DeliveryError("invalid_zone", "a ring is required");
  return repo.createZone(input, sub);
}

export async function updateZone(zoneId: string, patch: ZonePatch, sub: string): Promise<Zone> {
  if (!(await repo.zoneExists(zoneId))) throw new DeliveryError("zone_not_found", "zone not found");
  return repo.updateZone(zoneId, patch, sub);
}

// checkPostcode is the pre-add disclosure (FR-008/009/010): the places a postcode makes serviceable,
// whether it is unknown to the place record, and whether another zone already holds it.
export async function checkPostcode(postcode: string): Promise<PostcodeCheck> {
  const pc = normalizePostcode(postcode);
  const [places, inZoneCode] = await Promise.all([repo.placesForPostcode(pc), repo.postcodeZoneCode(pc)]);
  return { postcode: pc, places, placeCount: places.length, unknownPostcode: places.length === 0, inZoneCode };
}

// addPostcode adds a postcode to a zone after the FR-009/FR-010 guards: a postcode already in another
// zone is refused (naming it); an unknown postcode requires an explicit confirm, never a silent accept.
export async function addPostcode(
  zoneId: string, postcode: string, confirm: boolean, sub: string,
): Promise<PostcodeCheck> {
  if (!(await repo.zoneExists(zoneId))) throw new DeliveryError("zone_not_found", "zone not found");
  const pc = normalizePostcode(postcode);
  const inZone = await repo.postcodeZoneCode(pc);
  if (inZone) {
    throw new DeliveryError("postcode_in_zone", `postcode ${pc} already belongs to zone ${inZone}`, { zone: inZone });
  }
  const places = await repo.placesForPostcode(pc);
  if (places.length === 0 && !confirm) {
    throw new DeliveryError("unknown_postcode", `postcode ${pc} matches no known place — confirm to add it anyway`, { postcode: pc });
  }
  await repo.addZonePostcode(zoneId, pc, sub);
  return { postcode: pc, places, placeCount: places.length, unknownPostcode: places.length === 0, inZoneCode: null };
}

// removePostcode removes a postcode and reports the places that stop being serviceable (FR-011).
export async function removePostcode(zoneId: string, postcode: string, sub: string): Promise<RemovalImpact> {
  if (!(await repo.zoneExists(zoneId))) throw new DeliveryError("zone_not_found", "zone not found");
  const pc = normalizePostcode(postcode);
  const places = await repo.placesForPostcode(pc);
  await repo.removeZonePostcode(zoneId, pc, sub);
  return { postcode: pc, places, placeCount: places.length };
}

// suggestRing computes and persists a zone's suggested ring from its representative point vs the hub
// (FR-015). A zone with no coordinate gets no suggestion — never a defaulted nearest ring (FR-015 edge).
export async function suggestRing(zoneId: string): Promise<RingSuggestion> {
  if (!(await repo.zoneExists(zoneId))) throw new DeliveryError("zone_not_found", "zone not found");
  const settings = await repo.readSettings();
  if (!settings) throw new DeliveryError("hub_not_set", "set the operating hub in delivery settings first");
  const point = await repo.zoneRepresentativePoint(zoneId);
  if (point.n === 0) {
    await repo.persistZoneSuggestion(zoneId, null, null);
    return { ringId: null, hubDistanceKm: null, reason: "no_coordinate" };
  }
  const km = haversineKm(Number(settings.hubLatitude), Number(settings.hubLongitude), point.lat, point.lng);
  const rings = await repo.ringsForSuggestion();
  const ringId = ringForDistance(km, rings);
  await repo.persistZoneSuggestion(zoneId, ringId, km);
  return { ringId, hubDistanceKm: km.toFixed(2), reason: "ok" };
}

export async function getSettings(): Promise<Settings | null> {
  return repo.readSettings();
}

export async function putSettings(input: Settings, sub: string): Promise<Settings> {
  if (Number.isNaN(Number(input.hubLatitude)) || Number.isNaN(Number(input.hubLongitude))) {
    throw new DeliveryError("invalid_zone", "hub latitude and longitude must be numbers");
  }
  if (!Number.isInteger(input.samedayPrepBufferMin) || input.samedayPrepBufferMin < 0) {
    throw new DeliveryError("invalid_zone", "prep buffer must be a non-negative whole number of minutes");
  }
  return repo.upsertSettings(input, sub);
}

// ── Collection runs & same-day exceptions (047 US2/US3) ────────────────────────────────────────────

export async function listCollectionRuns() {
  return repo.listCollectionRuns();
}

export async function createCollectionRun(runTime: string, label: string | null, sub: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test((runTime ?? "").trim())) {
    throw new DeliveryError("invalid_zone", "run time must be HH:MM (24-hour, Australia/Melbourne)");
  }
  await repo.createCollectionRun(runTime.trim(), label?.trim() || null, sub);
  return repo.listCollectionRuns();
}

export async function deleteCollectionRun(id: string, sub: string) {
  await repo.deleteCollectionRun(id, sub);
  return repo.listCollectionRuns();
}

export async function listExceptions(zoneId: string) {
  return repo.listExceptions(zoneId);
}

export async function upsertException(shopId: string, zoneId: string, mode: string, sub: string) {
  if (mode !== "on" && mode !== "off") {
    throw new DeliveryError("invalid_zone", "mode must be 'on' or 'off'");
  }
  if (!(await repo.zoneExists(zoneId))) throw new DeliveryError("zone_not_found", "zone not found");
  await repo.upsertException(shopId, zoneId, mode, sub);
  return repo.listExceptions(zoneId);
}

export async function deleteException(shopId: string, zoneId: string, sub: string) {
  await repo.deleteException(shopId, zoneId, sub);
  return repo.listExceptions(zoneId);
}
