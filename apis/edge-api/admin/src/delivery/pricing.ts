// Service layer for delivery PRICING RULES (032) — validation and orchestration. No HTTP, no SQL
// (Principle VI). Tests mock ./pricing-repository at the module boundary.
//
// ⚠ THE REFUSALS ARE THE POINT OF THIS FILE. A pricing rule is operator-editable configuration that
// silently decides what every shopper pays, and the failure modes are all quiet ones — a cap below
// the floor makes every fee the cap; an empty band set prices everything at the base; an unrounded
// cap produces an odd number only on the most expensive orders. None of those throws anything at
// runtime. They just charge the wrong amount, forever, until somebody notices.
//
// Each refusal therefore has its own stable code, because "invalid" tells an operator nothing about
// which of the rules they broke. Same reasoning as 027's eight distinguishable promo refusals.
import * as repo from "./pricing-repository";
import {
  type DeliveryMethod,
  DELIVERY_METHODS,
  DeliveryError,
  type DeliveryRefusalCode,
  type FieldIssue,
  type PriceBand,
  type PricingRule,
  type PricingRuleInput,
} from "./types";

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const BOUND_RE = /^\d+(\.\d{1,2})?$/;

export function listRules(): Promise<PricingRule[]> {
  return repo.listRules();
}

/** Replace one method's rule and its whole band set. */
export async function replaceRule(
  methodRaw: string,
  body: Record<string, unknown>,
  actorSub: string,
): Promise<PricingRule> {
  if (!(DELIVERY_METHODS as readonly string[]).includes(methodRaw)) {
    throw new DeliveryError("not_found", `unknown delivery method ${methodRaw}`);
  }
  const method = methodRaw as DeliveryMethod;

  const fields: FieldIssue[] = [];
  const baseAmount = amount(body.baseAmount, "baseAmount", fields);
  const roundingStep = amount(body.roundingStep, "roundingStep", fields);
  const maxAmount = amount(body.maxAmount, "maxAmount", fields);
  const status = body.status === "disabled" ? "disabled" : "active";

  const distanceBands = bands(body.distanceBands, "distanceBands", fields);
  const weightBands = bands(body.weightBands, "weightBands", fields);

  if (fields.length > 0) {
    throw new DeliveryError("validation", "invalid pricing rule", fields);
  }

  // ── The five semantic refusals ──────────────────────────────────────────────────────────────
  //
  // Everything above is "is this a number?". Everything below is "would this configuration do
  // something the operator did not intend?", which is why these are 422 and carry a code.

  // ⚠ An empty band set is not "no adjustment" — it silently prices EVERY distance and EVERY weight
  // at the base, which is exactly the FR-011 defect (a gap meaning no fee) applied to the whole axis.
  if (distanceBands.length === 0 || weightBands.length === 0) {
    throw refuse(
      "bands_required",
      "both a distance band set and a weight band set are required — without them every order prices at the base amount, whatever it weighs and however far it goes",
    );
  }

  // Two answers for one value. Which one applies would come down to row order.
  for (const [label, set] of [["distance", distanceBands], ["weight", weightBands]] as const) {
    const seen = new Set<string>();
    for (const b of set) {
      const key = String(Number(b.upperBound));
      if (seen.has(key)) {
        throw refuse("duplicate_band", `two ${label} bands share the upper bound ${b.upperBound}`);
      }
      seen.add(key);
    }
  }

  const step = Number(roundingStep);
  if (!(step > 0)) {
    throw refuse("invalid_rounding", "the rounding step must be greater than zero");
  }

  // ⚠ THE FLOOR IS BASE + THE SMALLEST BAND FROM EACH AXIS, NOT THE LARGEST.
  //
  // Comparing against the largest bands would refuse every cap that could ever bind — which is
  // precisely what a cap is FOR. The real defect a cap-below-floor produces is a silently FLAT price
  // table: if the cheapest possible order already exceeds the ceiling, every order costs the ceiling,
  // distance and weight stop mattering entirely, and nothing reports it.
  const floor = Number(baseAmount) + smallestAdd(distanceBands) + smallestAdd(weightBands);
  const cap = Number(maxAmount);
  if (cap < floor) {
    throw refuse(
      "cap_below_floor",
      `the maximum ${maxAmount} is below the cheapest possible fee (${floor.toFixed(2)}) — every delivery would cost the maximum, and distance and weight would stop affecting the price at all`,
    );
  }

  // ⚠ min(cap, roundUp(...)) returns the cap verbatim. If the cap is not itself a multiple of the
  // step, the fee is unrounded at exactly the moment the cap binds — on the most expensive orders,
  // where an odd number is least likely to be spotted. SC-003 says 100% of fees are rounded.
  if (!isMultiple(cap, step)) {
    throw refuse(
      "cap_not_rounded",
      `the maximum ${maxAmount} is not a multiple of the rounding step ${roundingStep} — capped fees would not be rounded`,
    );
  }

  const input: PricingRuleInput = {
    baseAmount: baseAmount!,
    roundingStep: roundingStep!,
    maxAmount: maxAmount!,
    status,
    distanceBands,
    weightBands,
  };
  return repo.replaceRule(method, input, actorSub);
}

function refuse(code: DeliveryRefusalCode, message: string): DeliveryError {
  return new DeliveryError("unprocessable", message, undefined, code);
}

function smallestAdd(set: PriceBand[]): number {
  return set.reduce((min, b) => Math.min(min, Number(b.addAmount)), Number.POSITIVE_INFINITY);
}

/**
 * Multiple-of check in integer cents.
 *
 * ⚠ `45.00 % 0.50` in binary floating point is not reliably 0 — this is the classic case where a
 * modulus on floats reports a false failure and an operator cannot save a perfectly valid ceiling.
 * Both sides are money with at most two decimals, so integer cents is exact.
 */
function isMultiple(value: number, step: number): boolean {
  const v = Math.round(value * 100);
  const s = Math.round(step * 100);
  return s > 0 && v % s === 0;
}

function amount(raw: unknown, field: string, fields: FieldIssue[]): string | null {
  const s = typeof raw === "number" ? raw.toFixed(2) : typeof raw === "string" ? raw.trim() : "";
  if (!AMOUNT_RE.test(s)) {
    fields.push({ field, message: "must be a non-negative amount with up to 2 decimals" });
    return null;
  }
  return s;
}

function bands(raw: unknown, field: string, fields: FieldIssue[]): PriceBand[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    fields.push({ field, message: "must be an array of bands" });
    return [];
  }
  const out: PriceBand[] = [];
  for (const [i, item] of raw.entries()) {
    const row = item as Record<string, unknown>;
    const ub = typeof row?.upperBound === "number" ? String(row.upperBound) : String(row?.upperBound ?? "").trim();
    const add = amount(row?.addAmount, `${field}[${i}].addAmount`, fields);
    if (!BOUND_RE.test(ub) || Number(ub) <= 0) {
      fields.push({ field: `${field}[${i}].upperBound`, message: "must be a positive number" });
      continue;
    }
    if (add === null) continue;
    out.push({ upperBound: ub, addAmount: add });
  }
  // Sorted here so the stored set is always ascending regardless of how a console sent it — the
  // pricing core sorts too, but a table an operator reads should not be in submission order.
  out.sort((a, b) => Number(a.upperBound) - Number(b.upperBound));
  return out;
}
