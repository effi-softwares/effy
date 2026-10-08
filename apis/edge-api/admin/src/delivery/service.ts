// Service for the delivery fee-plan + ring config (047). Validation + orchestration; no SQL, no HTTP.
// ⚠ This surface VALIDATES a plan but never computes a customer fee — the fee engine's one home is
// `@effy/edge-shared/delivery`. The value here is the activation completeness gate (FR-051/SC-016) and the a≥b / step
// invariants surfaced as friendly field errors before they ever reach a DB CHECK.
import { announce } from "@effy/edge-shared/live";

import * as repo from "./repository";
import { DeliveryError, type FeePlan, type NewFeePlan, type Ring, type Settings } from "./types";

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
  const saved = await repo.upsertSettings(input, sub);
  // 076 — a hub move changed the coverage list's distances: an open Coverage screen re-reads.
  if (saved.distances) await announce([{ scope: "ops", kind: "coverage" }]);
  return saved;
}

// ── Collection runs (047 US2) ────────────────────────────────────────────

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
