import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./repository", () => ({
  readStock: vi.fn(),
  readMovements: vi.fn(),
  setCount: vi.fn(),
  adjustCount: vi.fn(),
  setTracking: vi.fn(),
  setThreshold: vi.fn(),
  readSettings: vi.fn(),
  writeSettings: vi.fn(),
  readLowStock: vi.fn(),
}));

import * as repo from "./repository";
import * as service from "./service";
import { StockError, type Actor, type StockRow } from "./types";

const shopActor: Actor = { sub: "sub-shop", shopId: "shop-1", kind: "shop" };

function row(over: Partial<StockRow> = {}): StockRow {
  return {
    productId: "p1",
    shopId: "shop-1",
    tracked: true,
    onHand: 5,
    threshold: null,
    shopDefaultThreshold: null,
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(repo.readMovements).mockResolvedValue([]);
  vi.mocked(repo.readStock).mockResolvedValue(row());
  vi.mocked(repo.setCount).mockResolvedValue({ before: 5, after: 9 });
  vi.mocked(repo.adjustCount).mockResolvedValue({ before: 5, after: 9 });
  vi.mocked(repo.setTracking).mockResolvedValue({ before: 0, after: 12 });
});

async function refusal(fn: () => Promise<unknown>): Promise<StockError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof StockError) return err;
    throw err;
  }
  throw new Error("expected a refusal, got success");
}

describe("counts must be whole, non-negative numbers (FR-001, FR-006)", () => {
  it.each([
    ["a negative count", -1],
    ["a fraction", 2.5],
    ["not a number at all", "3"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("refuses %s and writes NO movement", async (_label, onHand) => {
    const err = await refusal(() =>
      service.setCount(shopActor, "p1", { onHand, reason: "correction" }),
    );
    expect(err.kind).toBe("validation");
    // ⚠ The second half matters as much as the first: a refused change must leave no trace, or the
    // history stops being an account of what actually happened to the shelf.
    expect(repo.setCount).not.toHaveBeenCalled();
  });

  it("names the field so the console can point at the input", async () => {
    const err = await refusal(() =>
      service.setCount(shopActor, "p1", { onHand: -1, reason: "correction" }),
    );
    expect(err.fields).toHaveProperty("onHand");
  });
});

describe("a reason is required on anything that moves a count (FR-007)", () => {
  it("refuses a missing reason", async () => {
    const err = await refusal(() => service.setCount(shopActor, "p1", { onHand: 4 }));
    expect(err.kind).toBe("validation");
    expect(err.fields).toHaveProperty("reason");
  });

  it("refuses a reason the platform writes for itself", async () => {
    // ⚠ `order_paid` and `pick_shortfall` are facts the PLATFORM records. A human choosing one would
    // be writing a false account of why stock moved, into the table that exists to be true.
    for (const reason of ["order_paid", "pick_shortfall", "tracking_enabled"]) {
      const err = await refusal(() => service.setCount(shopActor, "p1", { onHand: 4, reason }));
      expect(err.kind, reason).toBe("validation");
    }
  });

  it("accepts each reason an operator may legitimately choose", async () => {
    for (const reason of ["received", "correction", "damage", "expiry"]) {
      await expect(service.setCount(shopActor, "p1", { onHand: 4, reason })).resolves.toBeDefined();
    }
  });
});

describe("turning tracking on requires a count (FR-003)", () => {
  it("refuses to enable tracking with no count rather than defaulting to zero", async () => {
    const err = await refusal(() => service.setTracking(shopActor, "p1", { tracked: true }));
    expect(err.kind).toBe("validation");
    expect(err.fields).toHaveProperty("onHand");
    // Defaulting would make the product instantly unbuyable with no operator intent behind it.
    expect(repo.setTracking).not.toHaveBeenCalled();
  });

  it("enables with a count", async () => {
    await service.setTracking(shopActor, "p1", { tracked: true, onHand: 12 });
    expect(repo.setTracking).toHaveBeenCalledWith(shopActor, "p1", true, 12);
  });

  it("disables without asking for one", async () => {
    await service.setTracking(shopActor, "p1", { tracked: false });
    expect(repo.setTracking).toHaveBeenCalledWith(shopActor, "p1", false, null);
  });
});

describe("relative adjustments", () => {
  it("refuses a zero delta — a movement that moves nothing is a record with no fact behind it", async () => {
    const err = await refusal(() =>
      service.adjustCount(shopActor, "p1", { delta: 0, reason: "correction" }),
    );
    expect(err.kind).toBe("validation");
    expect(err.fields).toHaveProperty("delta");
  });

  it("accepts a negative delta — breakage and expiry are reductions", async () => {
    await expect(
      service.adjustCount(shopActor, "p1", { delta: -3, reason: "damage" }),
    ).resolves.toBeDefined();
  });
});

describe("moving a count on an untracked product", () => {
  it("is a CONFLICT, not a not-found and not a silent success", async () => {
    vi.mocked(repo.readStock).mockResolvedValue(row({ tracked: false, onHand: null }));
    const err = await refusal(() =>
      service.setCount(shopActor, "p1", { onHand: 4, reason: "received" }),
    );
    // ⚠ The database would refuse this too (the write matches no row), but that refusal is
    // indistinguishable from "no such product" and would tell the operator the wrong thing.
    expect(err.kind).toBe("conflict");
  });
});

describe("the low / out distinction (FR-005, FR-005a, FR-029)", () => {
  it("a product at zero is OUT, and never also 'low'", () => {
    const dto = service.toStockDTO(row({ onHand: 0, shopDefaultThreshold: 5 }));
    expect(dto.outOfStock).toBe(true);
    expect(dto.low).toBe(false);
  });

  it("the shop default applies when the product carries no threshold of its own", () => {
    expect(service.toStockDTO(row({ onHand: 4, shopDefaultThreshold: 5 })).low).toBe(true);
    expect(service.toStockDTO(row({ onHand: 6, shopDefaultThreshold: 5 })).low).toBe(false);
  });

  it("the product's OWN threshold wins over the shop default", () => {
    const dto = service.toStockDTO(row({ onHand: 12, threshold: 20, shopDefaultThreshold: 5 }));
    expect(dto.effectiveThreshold).toBe(20);
    expect(dto.low).toBe(true);
  });

  it("with no threshold anywhere nothing is low — but zero is still out (FR-005a)", () => {
    expect(service.toStockDTO(row({ onHand: 3 })).low).toBe(false);
    expect(service.toStockDTO(row({ onHand: 0 })).outOfStock).toBe(true);
  });

  it("an untracked product is neither low nor out, whatever the columns hold", () => {
    const dto = service.toStockDTO(row({ tracked: false, onHand: 0, shopDefaultThreshold: 5 }));
    expect(dto.low).toBe(false);
    expect(dto.outOfStock).toBe(false);
    expect(dto.onHand).toBeNull();
  });
});

describe("a product that is not this shop's", () => {
  it("is refused exactly as a product that does not exist (FR-004)", async () => {
    vi.mocked(repo.readStock).mockResolvedValue(null);
    const missing = await refusal(() => service.getStock(shopActor, "p1"));
    const foreign = await refusal(() => service.getStock(shopActor, "someone-elses"));
    // ⚠ Byte-identical, not merely similar. A difference in wording is a difference an attacker can
    // read, and it would turn this route into an oracle for which product ids are real.
    expect(missing.kind).toBe(foreign.kind);
    expect(missing.message).toBe(foreign.message);
  });
});

// ── 054 US4: back-office acts on a shop's behalf, with FULL parity (FR-026, the Q5 clarification) ──
describe("the assisted path", () => {
  const boActor: Actor = { sub: "sub-admin", shopId: "shop-1", kind: "back_office" };

  // ⚠ FOUR POWERS, NOT A SUBSET. FR-026 and the Q5 answer both say "every stock action a shop
  // operator can". A support call that cannot do the thing a shop is ringing up to ask for is not an
  // assisted path — and "turn tracking off, we can't keep it accurate right now" is exactly the kind
  // of call support takes. The safety here is attribution and visibility (FR-027), not a narrower set
  // of actions.
  it("can do everything a shop operator can", async () => {
    await expect(
      service.setTracking(boActor, "p1", { tracked: true, onHand: 5 }),
    ).resolves.toBeDefined();
    await expect(
      service.setTracking(boActor, "p1", { tracked: false }),
    ).resolves.toBeDefined();
    await expect(
      service.setCount(boActor, "p1", { onHand: 9, reason: "correction" }),
    ).resolves.toBeDefined();
    await expect(
      service.setThreshold(boActor, "p1", { threshold: 5 }),
    ).resolves.toBeDefined();
    await expect(
      service.setSettings(boActor, { defaultThreshold: 3 }),
    ).resolves.toBeDefined();
  });

  // ⚠ ONE SERVICE, TWO AUDIENCES (research R6). Two copies of "what a valid stock change is" would
  // drift, and the drift would surface as back-office being able to write something a shop cannot.
  it("applies the SAME validation to back-office as to a shop", async () => {
    const shopErr = await refusal(() =>
      service.setCount(shopActor, "p1", { onHand: -1, reason: "correction" }),
    );
    const boErr = await refusal(() =>
      service.setCount(boActor, "p1", { onHand: -1, reason: "correction" }),
    );
    expect(boErr.kind).toBe(shopErr.kind);
    expect(boErr.message).toBe(shopErr.message);
  });

  it("still requires a count to turn tracking on, even for back-office (FR-003)", async () => {
    vi.mocked(repo.setTracking).mockClear();
    const err = await refusal(() => service.setTracking(boActor, "p1", { tracked: true }));
    expect(err.kind).toBe("validation");
    // The refusal happens before the repository is reached — nothing is written, by either audience.
    expect(repo.setTracking).not.toHaveBeenCalled();
  });

  it("passes the actor through so every movement is attributed to the individual (FR-027)", async () => {
    await service.setCount(boActor, "p1", { onHand: 9, reason: "correction" });
    expect(repo.setCount).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "back_office", sub: "sub-admin" }),
      "p1", 9, "correction", null,
    );
  });
});

describe("the restock list (FR-029)", () => {
  it("reads the caller's own shop", async () => {
    vi.mocked(repo.readLowStock).mockResolvedValue([]);
    await service.listLowStock(shopActor);
    expect(repo.readLowStock).toHaveBeenCalledWith("shop-1");
  });
});
