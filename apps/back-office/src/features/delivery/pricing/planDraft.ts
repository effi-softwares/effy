import type { FeePlanInput, FeePlanKind, FeePlanDTO } from "@effy/shared-types";

/**
 * What the plan editor holds while someone types (077). Strings throughout, as typed: the service
 * is the judge of every value and names each field it refuses, so nothing is parsed or rounded here
 * — a second set of rules in the console would be a second answer to "is this a valid plan?".
 */
export interface PlanDraft {
  name: string;
  baseAmount: string;
  distanceBands: { upperKm: string; addAmount: string }[];
  weightBands: { upperKg: string; addAmount: string }[];
  freeOverAmount: string;
  smallOrderUnderAmount: string;
  smallOrderFeeAmount: string;
  todayPremiumAmount: string;
  slotPremiums: Record<string, string>;
  roundingStepAmount: string;
  floorAmount: string;
  capAmount: string;
}

export function emptyDraft(kind: FeePlanKind): PlanDraft {
  return {
    name: "",
    baseAmount: kind === "courier" ? "" : "0.00",
    distanceBands: kind === "courier" ? [] : [{ upperKm: "", addAmount: "" }],
    weightBands: [{ upperKg: "", addAmount: "0.00" }],
    freeOverAmount: "",
    smallOrderUnderAmount: "",
    smallOrderFeeAmount: "",
    todayPremiumAmount: "0.00",
    slotPremiums: {},
    roundingStepAmount: "0.50",
    floorAmount: "",
    capAmount: "",
  };
}

/** A plan opened for editing — or copied, which keeps every value and asks for a new name. */
export function draftFrom(p: FeePlanDTO, copy: boolean): PlanDraft {
  return {
    name: copy ? `${p.name} (copy)` : p.name,
    baseAmount: p.baseAmount,
    distanceBands: p.distanceBands.map((b) => ({ upperKm: b.upperKm === null ? "" : String(Number(b.upperKm)), addAmount: b.addAmount })),
    weightBands: p.weightBands.map((b) => ({ upperKg: String(b.upperGrams / 1000), addAmount: b.addAmount })),
    freeOverAmount: p.freeOverAmount ?? "",
    smallOrderUnderAmount: p.smallOrderUnderAmount ?? "",
    smallOrderFeeAmount: p.smallOrderFeeAmount ?? "",
    todayPremiumAmount: p.todayPremiumAmount,
    slotPremiums: Object.fromEntries(p.slotPremiums.map((s) => [s.slotId, s.addAmount])),
    roundingStepAmount: p.roundingStepAmount,
    floorAmount: p.floorAmount,
    capAmount: p.capAmount,
  };
}

const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());

/**
 * The draft as the service takes it. A distance band with an empty "up to" is the LAST band — "and
 * beyond" — and it is sent last whatever row it was typed on. A weight is typed in kg, sent in grams.
 */
export function toInput(kind: FeePlanKind, d: PlanDraft): FeePlanInput {
  const distance = d.distanceBands
    .filter((b) => b.upperKm.trim() !== "" || b.addAmount.trim() !== "")
    .map((b) => ({ upperKm: blankToNull(b.upperKm), addAmount: b.addAmount.trim() }));
  const open = distance.filter((b) => b.upperKm === null);
  return {
    kind,
    name: d.name.trim(),
    baseAmount: d.baseAmount.trim() || "0.00",
    distanceBands: [...distance.filter((b) => b.upperKm !== null), ...open],
    weightBands: d.weightBands
      .filter((b) => b.upperKg.trim() !== "" || b.addAmount.trim() !== "")
      .map((b) => ({ upperGrams: Math.round(Number(b.upperKg) * 1000), addAmount: b.addAmount.trim() })),
    freeOverAmount: blankToNull(d.freeOverAmount),
    smallOrderUnderAmount: kind === "effy" ? blankToNull(d.smallOrderUnderAmount) : null,
    smallOrderFeeAmount: kind === "effy" ? blankToNull(d.smallOrderFeeAmount) : null,
    todayPremiumAmount: kind === "effy" ? d.todayPremiumAmount.trim() || "0.00" : "0.00",
    slotPremiums:
      kind === "effy"
        ? Object.entries(d.slotPremiums)
            .filter(([, v]) => v.trim() !== "" && Number(v) > 0)
            .map(([slotId, addAmount]) => ({ slotId, addAmount: addAmount.trim() }))
        : [],
    roundingStepAmount: d.roundingStepAmount.trim(),
    floorAmount: d.floorAmount.trim(),
    capAmount: d.capAmount.trim(),
  };
}
