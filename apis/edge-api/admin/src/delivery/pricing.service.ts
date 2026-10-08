// Service for delivery fee plans v2 (077): value validation, the role rules, and the simulator.
// No SQL, no HTTP (Principle VI).
//
// ⚠ THIS SURFACE NEVER ADDS UP A FEE. The simulator asks the same engine checkout asks
// (`priceEffyOrder` / `courierFee` in @effy/edge-shared/delivery), fed a plan loaded by id instead of
// "the active one" — which is the whole reason the simulator's answer equals the charge (FR-026).
import { formatCents, parseCents, pooled } from "@effy/edge-shared";
import {
  courierFee, courierValues, coverageForPostcode, feeDTO, feeLines, loadActivePlan, loadPlan, normalizePostcode,
  priceEffyOrder, type FeeBreakdown, type Plan, type PricedFee,
} from "@effy/edge-shared/delivery";
import { announce } from "@effy/edge-shared/live";
import type {
  FeePlanInput, FeePlanKind, FeePlanDTO, FeeSimulationDTO, FeeSimulationRequest, FeeSimulationStepDTO,
} from "@effy/shared-types";

import * as repo from "./pricing.repository";
import { PricingError } from "./pricing.repository";

export { PricingError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMOUNT = /^\d{1,7}(\.\d{1,2})?$/;
/** Wider than the country, as for a listed postcode's distance (076). */
const MAX_KM = 5000;

/** A plan was saved or made active: an open Pricing screen re-reads. After commit; never throws. */
const changed = (): Promise<void> => announce([{ scope: "ops", kind: "pricing" }]);

interface FieldError {
  field: string;
  message: string;
}

/** Every value error at once, so a manager fixes the form in one pass rather than one refusal at a time. */
class Fields {
  readonly errors: FieldError[] = [];
  add(field: string, message: string): void {
    this.errors.push({ field, message });
  }
  /** A non-negative 2-dp amount as cents, or null (and an error) when it is not one. */
  cents(field: string, v: unknown, { positive = false } = {}): number | null {
    if (typeof v !== "string" || !AMOUNT.test(v.trim())) {
      this.add(field, "must be an amount like 6.00");
      return null;
    }
    const c = parseCents(v.trim());
    if (positive && c <= 0) {
      this.add(field, "must be more than 0.00");
      return null;
    }
    return c;
  }
  optionalCents(field: string, v: unknown): number | null {
    return v === null || v === undefined || v === "" ? null : this.cents(field, v, { positive: true });
  }
}

/**
 * Value errors are refused at SAVE, as named fields (077 research R12). Gaps — missing or
 * out-of-order bands — are not refused: a half-built draft may be saved, and the gaps come back on
 * it. Every rule a table CHECK holds is refused here first, so a CHECK never surfaces as a 500.
 */
export function normalise(body: unknown): FeePlanInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const f = new Fields();
  const kind = b.kind === "courier" ? "courier" : b.kind === "effy" ? "effy" : null;
  if (!kind) f.add("kind", "must be effy or courier");

  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 60) f.add("name", "a plan name is 2 to 60 characters");

  const step = f.cents("roundingStepAmount", b.roundingStepAmount, { positive: true });
  const floor = f.cents("floorAmount", b.floorAmount);
  const cap = f.cents("capAmount", b.capAmount, { positive: true });
  const base = f.cents("baseAmount", b.baseAmount ?? "0.00");
  const today = kind === "courier" ? 0 : f.cents("todayPremiumAmount", b.todayPremiumAmount ?? "0.00");
  const freeOver = f.optionalCents("freeOverAmount", b.freeOverAmount);
  const smallUnder = f.optionalCents("smallOrderUnderAmount", b.smallOrderUnderAmount);
  const smallFee = f.optionalCents("smallOrderFeeAmount", b.smallOrderFeeAmount);

  const onStep = (field: string, c: number | null, label: string) => {
    if (step && c !== null && c % step !== 0) f.add(field, `${label} must be a multiple of the rounding step (${formatCents(step)})`);
  };
  onStep("floorAmount", floor, "the minimum fee");
  onStep("capAmount", cap, "the maximum fee");
  onStep("todayPremiumAmount", today, "the surcharge for today");
  onStep("smallOrderFeeAmount", smallFee, "the small-order fee");
  if (floor !== null && cap !== null && cap < floor) f.add("capAmount", "the maximum fee must be at least the minimum");
  if ((smallUnder === null) !== (smallFee === null)) {
    f.add(smallUnder === null ? "smallOrderUnderAmount" : "smallOrderFeeAmount", "set both the small-order amount and its fee, or neither");
  }
  if (smallUnder !== null && freeOver !== null && smallUnder >= freeOver) {
    f.add("smallOrderUnderAmount", "the small-order amount must be below the free-delivery amount — a basket cannot be both");
  }

  const distanceIn = Array.isArray(b.distanceBands) ? b.distanceBands : [];
  const weightIn = Array.isArray(b.weightBands) ? b.weightBands : [];
  const premiumsIn = Array.isArray(b.slotPremiums) ? b.slotPremiums : [];
  if (kind === "courier") {
    if (distanceIn.length > 0) f.add("distanceBands", "a courier table is not priced by distance");
    if (premiumsIn.length > 0) f.add("slotPremiums", "a courier table has no delivery windows");
    if (smallUnder !== null) f.add("smallOrderUnderAmount", "a courier table has no small-order fee");
  }

  const distanceBands = distanceIn.map((raw, i) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const open = d.upperKm === null || d.upperKm === undefined || d.upperKm === "";
    const km = open ? null : Number(d.upperKm);
    if (km !== null && !(Number.isFinite(km) && km > 0 && km <= MAX_KM)) f.add(`distanceBands.${i}.upperKm`, `up to how many km — between 0 and ${MAX_KM}`);
    const add = f.cents(`distanceBands.${i}.addAmount`, d.addAmount);
    return { upperKm: km === null ? null : km.toFixed(2), addAmount: add === null ? "0.00" : formatCents(add) };
  });
  if (distanceBands.filter((d) => d.upperKm === null).length > 1) f.add("distanceBands", "only the last band can have no upper limit");
  if (new Set(distanceBands.map((d) => d.upperKm)).size < distanceBands.length) f.add("distanceBands", "two bands end at the same distance");

  const weightBands = weightIn.map((raw, i) => {
    const w = (raw ?? {}) as Record<string, unknown>;
    const grams = Number(w.upperGrams);
    if (!Number.isSafeInteger(grams) || grams <= 0) f.add(`weightBands.${i}.upperGrams`, "up to how many grams — a whole number above 0");
    const add = f.cents(`weightBands.${i}.addAmount`, w.addAmount);
    return { upperGrams: grams, addAmount: add === null ? "0.00" : formatCents(add) };
  });
  if (new Set(weightBands.map((w) => w.upperGrams)).size < weightBands.length) f.add("weightBands", "two bands end at the same weight");

  const slotPremiums = premiumsIn.map((raw, i) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const slotId = typeof p.slotId === "string" && UUID.test(p.slotId) ? p.slotId : "";
    if (!slotId) f.add(`slotPremiums.${i}.slotId`, "choose a delivery window");
    const add = f.cents(`slotPremiums.${i}.addAmount`, p.addAmount, { positive: true });
    onStep(`slotPremiums.${i}.addAmount`, add, "a window surcharge");
    return { slotId, addAmount: add === null ? "0.00" : formatCents(add) };
  });
  if (new Set(slotPremiums.map((p) => p.slotId)).size < slotPremiums.length) f.add("slotPremiums", "a window can have one surcharge");

  if (f.errors.length > 0) throw new PricingError(422, "invalid_plan", "check the highlighted values", { fields: f.errors });
  return {
    kind: kind!, name,
    baseAmount: formatCents(base!), distanceBands, weightBands,
    freeOverAmount: freeOver === null ? null : formatCents(freeOver),
    smallOrderUnderAmount: smallUnder === null ? null : formatCents(smallUnder),
    smallOrderFeeAmount: smallFee === null ? null : formatCents(smallFee),
    todayPremiumAmount: formatCents(today!), slotPremiums,
    roundingStepAmount: formatCents(step!), floorAmount: formatCents(floor!), capAmount: formatCents(cap!),
  };
}

function kindOf(v: unknown): FeePlanKind {
  if (v === undefined || v === null || v === "" || v === "effy") return "effy";
  if (v === "courier") return "courier";
  throw new PricingError(400, "invalid_request", "kind is effy or courier");
}

function idOf(v: unknown): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new PricingError(404, "plan_not_found", "that fee plan does not exist");
  return v;
}

async function checkSlots(input: FeePlanInput): Promise<void> {
  if (input.slotPremiums.length === 0) return;
  const known = await repo.slotIds();
  const missing = input.slotPremiums.filter((p) => !known.has(p.slotId));
  if (missing.length > 0) {
    throw new PricingError(422, "invalid_plan", "check the highlighted values", {
      fields: missing.map((p) => ({ field: `slotPremiums.${input.slotPremiums.indexOf(p)}.slotId`, message: "that delivery window no longer exists" })),
    });
  }
}

// ── reads ───────────────────────────────────────────────────────────────────────────────────────

export async function listPlans(kind: unknown): Promise<{ items: FeePlanDTO[] }> {
  return { items: await repo.listPlans(kindOf(kind)) };
}

// ── writes ──────────────────────────────────────────────────────────────────────────────────────

export async function createPlan(body: unknown, sub: string): Promise<FeePlanDTO> {
  const input = normalise(body);
  await checkSlots(input);
  const id = await repo.savePlan(null, input, sub);
  await changed();
  return (await repo.readPlan(id))!;
}

export async function replaceDraft(planId: unknown, body: unknown, sub: string): Promise<FeePlanDTO> {
  const id = idOf(planId);
  const input = normalise(body);
  await checkSlots(input);
  await repo.savePlan(id, input, sub);
  await changed();
  return (await repo.readPlan(id))!;
}

export async function activatePlan(planId: unknown, body: unknown, sub: string): Promise<FeePlanDTO> {
  const id = idOf(planId);
  const confirm = (body as { confirmZeroFloor?: unknown } | null)?.confirmZeroFloor === true;
  await repo.activatePlan(id, sub, confirm);
  await changed();
  return (await repo.readPlan(id))!;
}

// ── the simulator ───────────────────────────────────────────────────────────────────────────────

const km = (n: number) => `${Number(n.toFixed(2))} km`;
const kg = (grams: number) => `${Number((grams / 1000).toFixed(3))} kg`;

/** The steps that built a fee, in the words staff read them in (FR-025). */
export function stepsOf(b: FeeBreakdown, plan: Plan): FeeSimulationStepDTO[] {
  const steps: FeeSimulationStepDTO[] = [];
  const amount = (c: number) => formatCents(c);
  if (b.kind === "effy") {
    steps.push({ label: "Base", detail: "every delivery starts here", amount: amount(b.baseCents) });
    steps.push({
      label: "Distance",
      detail: `${km(b.km ?? 0)} — ${b.distanceBandUpperKm === null ? "the last band, with no upper limit" : `the band up to ${km(b.distanceBandUpperKm)}`}`,
      amount: amount(b.distanceCents),
    });
  } else {
    steps.push({ label: "Courier, per order", detail: "the flat amount for any courier delivery", amount: amount(b.baseCents) });
  }
  steps.push({
    label: "Weight",
    detail: `${kg(b.grams)} — ${b.weightBandUpperGrams === null ? "the heaviest band, which also prices everything above it" : `the band up to ${kg(b.weightBandUpperGrams)}`}`,
    amount: amount(b.weightCents),
  });
  if (b.premiumCents > 0) steps.push({ label: "Window surcharge", detail: "what the chosen window adds", amount: amount(b.premiumCents) });
  if (b.roundedCents !== b.rawCents) {
    steps.push({ label: "Rounded up", detail: `${amount(b.rawCents)} up to the next ${amount(plan.stepCents)}`, amount: amount(b.roundedCents) });
  }
  if (b.clamp === "floor") steps.push({ label: "Minimum fee", detail: `raised to the minimum of ${amount(plan.floorCents)}`, amount: amount(b.clampedCents) });
  if (b.clamp === "cap") steps.push({ label: "Maximum fee", detail: `held at the maximum of ${amount(plan.capCents)}`, amount: amount(b.clampedCents) });
  if (b.freeApplied) {
    steps.push({ label: "Free delivery", detail: `the basket (${amount(b.basketCents)}) reaches ${amount(plan.freeOverCents ?? 0)}`, amount: `-${amount(b.clampedCents)}` });
  }
  if (b.smallOrderCents > 0) {
    steps.push({ label: "Small-order fee", detail: `the basket (${amount(b.basketCents)}) is under ${amount(plan.smallOrderUnderCents ?? 0)}`, amount: amount(b.smallOrderCents) });
  }
  steps.push({ label: "Total", detail: "what the customer pays for delivery", amount: amount(b.totalCents) });
  return steps;
}

function stateOf(plan: Plan): "draft" | "active" | "retired" {
  return plan.isActive ? "active" : plan.activatedAt ? "retired" : "draft";
}

/**
 * What would this delivery cost under this plan, and why? READ-ONLY (FR-027): it loads, it prices,
 * it writes nothing and announces nothing.
 */
export async function simulate(body: unknown): Promise<FeeSimulationDTO> {
  const r = (body ?? {}) as Partial<FeeSimulationRequest>;
  const postcode = typeof r.postcode === "string" ? normalizePostcode(r.postcode) : null;
  if (!postcode) throw new PricingError(400, "invalid_postcode", "a postcode is exactly four digits");
  const grams = Number(r.grams);
  if (!Number.isSafeInteger(grams) || grams <= 0) throw new PricingError(400, "invalid_request", "weight is a whole number of grams above 0");
  if (typeof r.basketAmount !== "string" || !AMOUNT.test(r.basketAmount)) throw new PricingError(400, "invalid_request", "basket value is an amount like 54.00");
  const basketCents = parseCents(r.basketAmount);
  const slotId = typeof r.slotId === "string" && r.slotId !== "" ? r.slotId : null;
  const windowIsToday = r.windowIsToday === true;

  const coverage = await coverageForPostcode(pooled, postcode);
  if (coverage.reason === "unknown_postcode") throw new PricingError(422, "unknown_postcode", "not a known postcode");
  // Courier delivery cannot be switched on yet, so a courier table can only be tried on purpose.
  const kind: FeePlanKind | null = r.forceKind === "courier" ? "courier" : coverage.kind === "effy" ? "effy" : coverage.kind === "courier" ? "courier" : null;

  if (kind === null) {
    return { coverage: coverage.kind, plan: null, fee: null, steps: [], note: `Effy does not deliver to ${postcode}, and no courier does either.` };
  }

  let plan: Plan;
  if (r.planId) {
    const found = await loadPlan(pooled, idOf(r.planId));
    if (!found) throw new PricingError(404, "plan_not_found", "that fee plan does not exist");
    if (found.kind !== kind) {
      throw new PricingError(422, "plan_kind_mismatch", kind === "effy"
        ? `${postcode} is delivered by Effy, and that is a courier table`
        : `${postcode} would go by courier, and that is an Effy plan`);
    }
    plan = found;
  } else {
    plan = await loadActivePlan(pooled, kind).catch(() => {
      throw new PricingError(404, "plan_not_found", kind === "courier" ? "no courier table is in force" : "no fee plan is in force");
    });
  }

  let fee: PricedFee;
  if (kind === "effy") {
    if (coverage.distanceKm === null) throw new PricingError(422, "unknown_postcode", `${postcode} is not on Effy's list`);
    fee = priceEffyOrder(plan, postcode, coverage.distanceKm, grams, basketCents, slotId, windowIsToday);
  } else {
    const breakdown = courierFee({ grams, basketCents, plan: courierValues(plan) });
    fee = { planId: plan.id, planName: plan.name, slotId: null, windowIsToday: false, breakdown, lines: feeLines(breakdown), totalCents: breakdown.totalCents };
  }

  const note =
    kind === "courier" && coverage.kind === "effy" ? `${postcode} is delivered by Effy; this is what a courier would cost.`
    : kind === "courier" ? `Effy does not deliver to ${postcode}; a courier does.`
    : null;
  return {
    coverage: coverage.kind,
    plan: { id: plan.id, name: plan.name, kind: plan.kind, state: stateOf(plan) },
    fee: feeDTO(fee),
    steps: stepsOf(fee.breakdown, plan),
    note,
  };
}
