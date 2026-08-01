import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  shopOrigin: vi.fn(),
  readDeclarations: vi.fn(),
  unknownPostcodes: vi.fn(),
  submitDeclaration: vi.fn(),
}));
vi.mock("./repository", () => repo);

import { getDeclarations, submitDeclaration } from "./declarations";
import { isDeclarationError } from "./types";

/** The refusal code, or the error kind when there is none, or "no-throw". */
async function refusalOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    if (!isDeclarationError(e)) return "other";
    return e.code ?? e.kind;
  }
}

const EMPTY = { inForce: null, pending: null, lastDecision: null };
const VALID = { offersSameday: true, cutoffTime: "14:00", postcodes: ["3550"] };

beforeEach(() => {
  vi.resetAllMocks();
  repo.shopOrigin.mockResolvedValue({ postcode: "3550", mappable: true });
  repo.readDeclarations.mockResolvedValue(EMPTY);
  repo.unknownPostcodes.mockResolvedValue([]);
  repo.submitDeclaration.mockResolvedValue(undefined);
});

describe("submitDeclaration", () => {
  it("accepts a well-formed declaration", async () => {
    await submitDeclaration("shop-1", { ...VALID }, "sub-1");
    expect(repo.submitDeclaration).toHaveBeenCalledWith(
      "shop-1",
      { offersSameday: true, cutoffTime: "14:00", postcodes: ["3550"] },
      "sub-1",
    );
  });

  // ── The six refusals, each distinguishable ──────────────────────────────────────────────────

  it("refuses a shop with no location at all", async () => {
    repo.shopOrigin.mockResolvedValue({ postcode: null, mappable: false });
    expect(await refusalOf(submitDeclaration("shop-1", { ...VALID }, "s"))).toBe("shop_location_required");
    expect(repo.submitDeclaration).not.toHaveBeenCalled();
  });

  // ⚠ THE SUBTLE ONE, and its own refusal for a reason. This shop HAS a postcode — it passes the
  // check above — but the platform does not know where that postcode is, so every requested area
  // would report a NULL distance on the approval screen and the admin would decide blind. That is
  // exactly the failure FR-023 exists to prevent, and this is the only place to catch it.
  it("refuses a shop whose postcode has no known location, separately", async () => {
    repo.shopOrigin.mockResolvedValue({ postcode: "3001", mappable: false });
    const code = await refusalOf(submitDeclaration("shop-1", { ...VALID }, "s"));
    expect(code).toBe("shop_location_unmappable");
    expect(code).not.toBe("shop_location_required");
  });

  it("refuses same-day with no areas", async () => {
    expect(await refusalOf(submitDeclaration("shop-1", { ...VALID, postcodes: [] }, "s"))).toBe("areas_required");
  });

  // ⚠ FR-030 — "same-day, no cutoff" makes the withdrawal rule undecidable.
  it("refuses same-day with no cutoff", async () => {
    expect(await refusalOf(submitDeclaration("shop-1", { ...VALID, cutoffTime: "" }, "s"))).toBe("cutoff_required");
    expect(await refusalOf(submitDeclaration("shop-1", { ...VALID, cutoffTime: "25:99" }, "s"))).toBe("cutoff_required");
  });

  it("refuses areas or a cutoff when same-day is switched off", async () => {
    expect(await refusalOf(submitDeclaration("shop-1", { offersSameday: false, postcodes: ["3550"] }, "s"))).toBe(
      "areas_not_applicable",
    );
    expect(await refusalOf(submitDeclaration("shop-1", { offersSameday: false, cutoffTime: "14:00" }, "s"))).toBe(
      "areas_not_applicable",
    );
  });

  // ⚠ 031's live 3001 defect on a second surface: a field that validates a postcode's SHAPE and
  // nothing else lets a PO-box code into the configuration, where it is found weeks later by a
  // hand-written query.
  it("refuses a postcode no locality names", async () => {
    repo.unknownPostcodes.mockResolvedValue(["3001"]);
    expect(await refusalOf(submitDeclaration("shop-1", { ...VALID, postcodes: ["3001"] }, "s"))).toBe(
      "unknown_postcode",
    );
    expect(repo.submitDeclaration).not.toHaveBeenCalled();
  });

  it("rejects a malformed postcode as a validation error", async () => {
    expect(await refusalOf(submitDeclaration("shop-1", { ...VALID, postcodes: ["35"] }, "s"))).toBe("validation");
  });

  // ── FR-017 / FR-021 — the properties that make US2 safe on its own ──────────────────────────

  // ⚠ THE MOST IMPORTANT ASSERTION IN THIS FILE. A shop must not be able to approve itself, and the
  // strongest form of that is a code path where the word has nowhere to go — not a check that
  // rejects it, which someone could later "relax".
  it("ignores a client-supplied status outright", async () => {
    await submitDeclaration("shop-1", { ...VALID, status: "approved", decidedBy: "me" }, "s");
    const passed = repo.submitDeclaration.mock.calls[0]![1] as Record<string, unknown>;
    expect(passed).not.toHaveProperty("status");
    expect(passed).not.toHaveProperty("decidedBy");
  });

  // The repository is what creates a PENDING row and leaves any approved one alone (FR-018); the
  // service must never ask it for anything else.
  it("never asks the repository to write a decided declaration", async () => {
    await submitDeclaration("shop-1", { ...VALID }, "s");
    const passed = repo.submitDeclaration.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(passed).sort()).toEqual(["cutoffTime", "offersSameday", "postcodes"]);
  });

  it("de-duplicates repeated postcodes", async () => {
    await submitDeclaration("shop-1", { ...VALID, postcodes: ["3550", "3550", "3350"] }, "s");
    expect((repo.submitDeclaration.mock.calls[0]![1] as { postcodes: string[] }).postcodes).toEqual(["3550", "3350"]);
  });

  it("switching same-day off clears the areas and the cutoff", async () => {
    await submitDeclaration("shop-1", { offersSameday: false }, "s");
    expect(repo.submitDeclaration).toHaveBeenCalledWith(
      "shop-1",
      { offersSameday: false, cutoffTime: null, postcodes: [] },
      "s",
    );
  });
});

describe("getDeclarations", () => {
  // ⚠ BOTH inForce AND pending, always. A single "current declaration" field would force the API to
  // choose which truth to tell, and whichever it chose the other would be invisible — the shop would
  // either think a pending edit was already live, or think an approved one had been lost (FR-018).
  it("returns in-force and pending as separate facts", async () => {
    repo.readDeclarations.mockResolvedValue({
      inForce: { id: "a", status: "approved", cutoffTime: "14:00" },
      pending: { id: "b", status: "pending", cutoffTime: "12:00" },
      lastDecision: { id: "a", status: "approved" },
    });
    const view = await getDeclarations("shop-1");
    expect(view.inForce?.id).toBe("a");
    expect(view.pending?.id).toBe("b");
    expect(view.inForce?.cutoffTime).not.toBe(view.pending?.cutoffTime);
  });

  // ⚠ The reason travels on the READ so the console can explain BEFORE an operator fills in a form
  // and is refused at the end of it.
  it("reports why a shop cannot declare, on the read", async () => {
    repo.shopOrigin.mockResolvedValue({ postcode: null, mappable: false });
    const view = await getDeclarations("shop-1");
    expect(view.canDeclare).toBe(false);
    expect(view.cannotDeclareReason).toBe("shop_location_required");
  });

  it("reports the unmappable reason distinctly", async () => {
    repo.shopOrigin.mockResolvedValue({ postcode: "3001", mappable: false });
    expect((await getDeclarations("shop-1")).cannotDeclareReason).toBe("shop_location_unmappable");
  });

  it("allows declaring when the shop has a known location", async () => {
    const view = await getDeclarations("shop-1");
    expect(view.canDeclare).toBe(true);
    expect(view.cannotDeclareReason).toBeNull();
  });
});
