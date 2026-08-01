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
import { DELIVERY_METHODS, DeliveryError, type DeliveryMethod } from "./types";
import type { Area, AreaServiceLevel, AreaShopFeasibility } from "./types";
import { postcodeCoverage } from "./localities";
import * as repo from "./repository";

const POSTCODE_RE = /^[0-9]{4}$/;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

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

export interface ConfigureAreaInput {
  serviceLevels?: unknown;
}

/**
 * Configure an area's service levels.
 *
 * ⚠ A REPLACE, NOT A PATCH. A method omitted from the request is a method turned OFF, not one left
 * ambiguous — ambiguity about what is offered is what this whole feature exists to remove.
 *
 * ⚠ THE SAME-DAY GUARD (FR-018). A fee is a business choice the platform can absorb; **same-day is a
 * physical claim about time**, true only if a shop holding the goods can reach that area today.
 * Enabling it where no shop shares the area's zone requires an explicit acknowledgement, and its
 * absence is a 422 — refused on the SERVER, because a UI-only guard is not a guard.
 */
export async function configureArea(
  zoneId: string,
  postcode: string,
  input: ConfigureAreaInput,
  actorSub: string,
): Promise<Area> {
  if (!POSTCODE_RE.test(postcode)) {
    throw new DeliveryError("validation", "invalid postcode", [
      { field: "postcode", message: "must be a 4-digit postcode" },
    ]);
  }
  const raw = input.serviceLevels;
  if (!Array.isArray(raw)) {
    throw new DeliveryError("validation", "invalid serviceLevels", [
      { field: "serviceLevels", message: "must be an array" },
    ]);
  }

  const fields: { field: string; message: string }[] = [];
  const levels: (AreaServiceLevel & { acknowledged: boolean })[] = [];

  for (const entry of raw as Record<string, unknown>[]) {
    const method = entry?.method as DeliveryMethod;
    // ⚠ FR-029: the configurable set is EXACTLY the platform's set. This slice is the first interface
    // to expose all three together, so it is the one place a fourth could slip in unnoticed.
    if (!DELIVERY_METHODS.includes(method)) {
      fields.push({ field: "method", message: `"${String(method)}" is not a delivery method` });
      continue;
    }
    const enabled = entry.enabled === true;
    const feeAmount = typeof entry.feeAmount === "string" ? entry.feeAmount : null;
    if (enabled && (!feeAmount || !MONEY_RE.test(feeAmount))) {
      fields.push({ field: "feeAmount", message: `${method} is enabled but has no valid fee` });
    }
    levels.push({
      method,
      enabled,
      feeAmount,
      leadDaysMin: typeof entry.leadDaysMin === "number" ? entry.leadDaysMin : null,
      leadDaysMax: typeof entry.leadDaysMax === "number" ? entry.leadDaysMax : null,
      sameDayCutoff: typeof entry.sameDayCutoff === "string" ? entry.sameDayCutoff : null,
      acknowledged: entry.noNearbyShopAcknowledged === true,
    });
  }
  if (fields.length > 0) throw new DeliveryError("validation", "invalid serviceLevels", fields);

  const sameDay = levels.find((l) => l.method === "same_day" && l.enabled);
  if (sameDay && !sameDay.acknowledged) {
    const shops = await repo.shopsForArea(zoneId);
    if (!shops.some((s) => s.inZone)) {
      // ⚠ 422, not a silent accept. Offering same-day where nothing can serve it breaks the promise
      // at the moment the shopper is most committed — the failure 025 and 030 exist to prevent.
      throw new DeliveryError("conflict", "no nearby shop for same-day", [
        {
          field: "same_day",
          message:
            "No shop is in this area's delivery zone, so same-day may not be deliverable. " +
            "Confirm to enable it anyway.",
        },
      ]);
    }
  }

  await repo.projectAreaServiceLevels(
    zoneId,
    postcode,
    levels.map(({ acknowledged: _ack, ...l }) => l),
    actorSub,
  );
  return getArea(zoneId, postcode);
}

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
