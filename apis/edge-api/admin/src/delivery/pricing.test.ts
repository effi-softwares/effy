import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listRules: vi.fn(),
  getRule: vi.fn(),
  replaceRule: vi.fn(),
}));
vi.mock("./pricing-repository", () => repo);

import { listRules, replaceRule } from "./pricing";
import { isDeliveryError } from "./types";

/** The refusal code, or the error kind when there is none, or "no-throw". */
async function refusalOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    if (!isDeliveryError(e)) return "other";
    return e.code ?? e.kind;
  }
}

// base 6.00 · step 0.50 · cap 45.00 · distance ≤5 +0, ≤15 +3, ≤50 +9 · weight ≤2 +0, ≤10 +2.50
const validBody = {
  baseAmount: "6.00",
  roundingStep: "0.50",
  maxAmount: "45.00",
  status: "active",
  distanceBands: [
    { upperBound: "5", addAmount: "0.00" },
    { upperBound: "15", addAmount: "3.00" },
    { upperBound: "50", addAmount: "9.00" },
  ],
  weightBands: [
    { upperBound: "2", addAmount: "0.00" },
    { upperBound: "10", addAmount: "2.50" },
  ],
};

describe("pricing rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.replaceRule.mockResolvedValue({ method: "standard" });
    repo.listRules.mockResolvedValue([]);
  });

  it("accepts a well-formed rule", async () => {
    await replaceRule("standard", { ...validBody }, "admin-sub");
    expect(repo.replaceRule).toHaveBeenCalledWith(
      "standard",
      expect.objectContaining({ baseAmount: "6.00", maxAmount: "45.00" }),
      "admin-sub",
    );
  });

  it("404s an unknown method", async () => {
    expect(await refusalOf(replaceRule("teleport", { ...validBody }, "s"))).toBe("not_found");
  });

  it("reads all rules", async () => {
    await listRules();
    expect(repo.listRules).toHaveBeenCalled();
  });

  // ── The five semantic refusals, each distinguishable ────────────────────────────────────────

  // ⚠ An empty band set is not "no adjustment" — it prices EVERY distance and EVERY weight at the
  // base. A 200g order to the next suburb and a 20kg order to Perth would cost the same, and the
  // console would look correctly filled in.
  it("refuses an empty band set", async () => {
    expect(await refusalOf(replaceRule("standard", { ...validBody, distanceBands: [] }, "s"))).toBe("bands_required");
    expect(await refusalOf(replaceRule("standard", { ...validBody, weightBands: [] }, "s"))).toBe("bands_required");
    expect(repo.replaceRule).not.toHaveBeenCalled();
  });

  it("refuses two bands sharing an upper bound", async () => {
    const dup = [...validBody.distanceBands, { upperBound: "15", addAmount: "4.00" }];
    expect(await refusalOf(replaceRule("standard", { ...validBody, distanceBands: dup }, "s"))).toBe("duplicate_band");
  });

  it("refuses a zero rounding step", async () => {
    expect(await refusalOf(replaceRule("standard", { ...validBody, roundingStep: "0", maxAmount: "45" }, "s"))).toBe(
      "invalid_rounding",
    );
  });

  // ⚠ THE ONE THE ANALYZE PASS CAUGHT. The floor is base + the SMALLEST band from each axis.
  //
  // Here base 6.00 + smallest distance add 0.00 + smallest weight add 0.00 = 6.00, so a cap of 5.00
  // is below the cheapest fee the rule can ever produce: every delivery would cost 5.00, and distance
  // and weight would stop affecting the price entirely.
  it("refuses a cap below the FLOOR", async () => {
    expect(await refusalOf(replaceRule("standard", { ...validBody, maxAmount: "5.00" }, "s"))).toBe("cap_below_floor");
  });

  // ⚠ THE COMPANION ASSERTION, AND THE MORE IMPORTANT OF THE TWO.
  //
  // If the predicate were written against the LARGEST bands (6.00 + 9.00 + 2.50 = 17.50) this cap
  // would be refused — and so would every cap that could ever bind, which is exactly what FR-012
  // exists to allow. A ceiling nobody can set is not a ceiling.
  it("ACCEPTS a cap that legitimately binds", async () => {
    await replaceRule("standard", { ...validBody, maxAmount: "12.00" }, "s");
    expect(repo.replaceRule).toHaveBeenCalled();
  });

  // ⚠ min(cap, roundUp(...)) returns the cap verbatim, so an unrounded cap produces an unrounded fee
  // — but only once the cap binds, i.e. only on the most expensive orders, where nobody is looking.
  it("refuses a cap that is not a multiple of the rounding step", async () => {
    expect(await refusalOf(replaceRule("standard", { ...validBody, maxAmount: "45.33" }, "s"))).toBe("cap_not_rounded");
  });

  // ⚠ Float modulus regression: 45.00 % 0.50 is not reliably 0 in binary floating point, and a naive
  // check would refuse a perfectly valid ceiling with an error the operator cannot act on.
  it("does not falsely refuse a rounded cap (float modulus)", async () => {
    // ⚠ Every one of these must ALSO be at or above the 6.00 floor, or this test would be asserting
    // the wrong refusal. (It did on first run: 0.50 is a legitimately-refused cap_below_floor, and
    // the fixture — not the code — was wrong.)
    for (const cap of ["6.00", "7.50", "12.50", "45.00", "100.00"]) {
      expect(await refusalOf(replaceRule("standard", { ...validBody, maxAmount: cap }, "s"))).toBe("no-throw");
    }
  });

  // ── Shape validation stays a 400 ────────────────────────────────────────────────────────────

  it("rejects a non-numeric amount as a validation error, not a refusal", async () => {
    expect(await refusalOf(replaceRule("standard", { ...validBody, baseAmount: "free" }, "s"))).toBe("validation");
  });

  it("rejects a zero or negative band bound", async () => {
    const bad = [{ upperBound: "0", addAmount: "1.00" }];
    expect(await refusalOf(replaceRule("standard", { ...validBody, distanceBands: bad }, "s"))).toBe("validation");
  });

  // ── Normalisation ───────────────────────────────────────────────────────────────────────────

  it("stores bands in ascending order whatever order they arrived in", async () => {
    const shuffled = [
      { upperBound: "50", addAmount: "9.00" },
      { upperBound: "5", addAmount: "0.00" },
      { upperBound: "15", addAmount: "3.00" },
    ];
    await replaceRule("standard", { ...validBody, distanceBands: shuffled }, "s");
    const input = repo.replaceRule.mock.calls[0]![1] as { distanceBands: { upperBound: string }[] };
    expect(input.distanceBands.map((b) => b.upperBound)).toEqual(["5", "15", "50"]);
  });

  // FR-013/SC-014 — a pricing change must name a person.
  it("passes the actor through for the audit row", async () => {
    await replaceRule("standard", { ...validBody }, "admin-42");
    expect(repo.replaceRule).toHaveBeenCalledWith(expect.anything(), expect.anything(), "admin-42");
  });
});
