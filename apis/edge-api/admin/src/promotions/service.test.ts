import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listPromos: vi.fn(),
  readPromo: vi.fn(),
  auditFor: vi.fn(),
  createPromo: vi.fn(),
  updatePromo: vi.fn(),
  setStatus: vi.fn(),
  deletePromo: vi.fn(),
  readOrderPolicy: vi.fn(),
  writeOrderPolicy: vi.fn(),
}));
vi.mock("./repository", () => repo);

// 029: the artwork verifier reaches S3 and parses headers. Both are mocked at the module boundary,
// matching how ./repository is handled.
const media = vi.hoisted(() => ({ readObjectPrefix: vi.fn(), presignUpload: vi.fn(), isMediaValidationError: () => false }));
const imageDimensions = vi.hoisted(() => {
  class DimensionsBeyondBufferError extends Error {}
  class UnsupportedImageError extends Error {}
  return {
    readImageDimensions: vi.fn(),
    DimensionsBeyondBufferError,
    UnsupportedImageError,
    isDimensionsBeyondBuffer: (e: unknown) => e instanceof DimensionsBeyondBufferError,
    isUnsupportedImage: (e: unknown) => e instanceof UnsupportedImageError,
  };
});
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...media,
  ...imageDimensions,
}));

import { createPromo, listPromos, readPromo, setStatus, updatePromo, writeOrderPolicy } from "./service";
import { isPromoError } from "./types";

/** The wire refusal code, or a marker — so a test asserts WHICH refusal, not merely that one happened. */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isPromoError(e) ? e.code : "other";
  }
}

const VALID_PERCENT = { code: "SPRING20", kind: "percentage", percentOff: 20 };

beforeEach(() => vi.clearAllMocks());

describe("createPromo validation", () => {
  it("accepts a percentage code and defaults the minimum to zero", async () => {
    repo.createPromo.mockResolvedValue({ id: "p1" });
    await createPromo(VALID_PERCENT, "actor");
    expect(repo.createPromo).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SPRING20", kind: "percentage", percentOff: 20, amountOff: null, minimumSubtotalAmount: "0.00" }),
      "actor",
    );
  });

  it("accepts a fixed code and carries no percentage", async () => {
    repo.createPromo.mockResolvedValue({ id: "p1" });
    await createPromo({ code: "TEN", kind: "fixed", amountOff: "10.00" }, "actor");
    expect(repo.createPromo).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "fixed", amountOff: "10.00", percentOff: null }),
      "actor",
    );
  });

  it.each([
    ["a percentage over 100", { ...VALID_PERCENT, percentOff: 101 }, "promo_percent_invalid"],
    ["a percentage of zero", { ...VALID_PERCENT, percentOff: 0 }, "promo_percent_invalid"],
    ["a fixed amount of zero", { code: "X", kind: "fixed", amountOff: "0.00" }, "promo_amount_invalid"],
    ["a fixed amount with three decimals", { code: "X", kind: "fixed", amountOff: "1.234" }, "promo_amount_invalid"],
    ["an unknown kind", { code: "X", kind: "buy_one_get_one" }, "promo_kind_mismatch"],
    ["a negative minimum", { ...VALID_PERCENT, minimumSubtotalAmount: "-5.00" }, "promo_minimum_invalid"],
    ["a zero cap", { ...VALID_PERCENT, maxRedemptions: 0 }, "promo_cap_invalid"],
    ["a fractional cap", { ...VALID_PERCENT, maxPerCustomer: 1.5 }, "promo_cap_invalid"],
    ["an empty code", { ...VALID_PERCENT, code: "  " }, "promo_definition_invalid"],
  ])("refuses %s", async (_label, input, expected) => {
    expect(await codeOf(createPromo(input as never, "actor"))).toBe(expected);
    expect(repo.createPromo).not.toHaveBeenCalled();
  });

  it("refuses a percentage code that also carries an amount — the schema cannot represent it", async () => {
    expect(await codeOf(createPromo({ ...VALID_PERCENT, amountOff: "5.00" } as never, "actor"))).toBe("promo_amount_invalid");
  });

  it("refuses a window that ends before it starts", async () => {
    const input = { ...VALID_PERCENT, startsAt: "2026-08-01T00:00:00Z", endsAt: "2026-07-01T00:00:00Z" };
    expect(await codeOf(createPromo(input, "actor"))).toBe("promo_window_invalid");
  });

  it("refuses a window that ends exactly when it starts — a promotion that can never run", async () => {
    const at = "2026-08-01T00:00:00Z";
    expect(await codeOf(createPromo({ ...VALID_PERCENT, startsAt: at, endsAt: at }, "actor"))).toBe("promo_window_invalid");
  });

  it("names the offending field so the console can point at it", async () => {
    try {
      await createPromo({ ...VALID_PERCENT, percentOff: 400 }, "actor");
      expect.unreachable();
    } catch (e) {
      expect(isPromoError(e) && e.fields[0]?.field).toBe("percentOff");
      expect(isPromoError(e) && e.status).toBe(422);
    }
  });
});

describe("updatePromo", () => {
  it("allows a partial edit that touches only the window", async () => {
    repo.updatePromo.mockResolvedValue({ id: "p1" });
    await updatePromo("p1", { endsAt: "2026-09-01T00:00:00Z" }, "actor");
    expect(repo.updatePromo).toHaveBeenCalledWith("p1", { endsAt: "2026-09-01T00:00:00Z" }, "actor");
  });

  it("still validates the fields that WERE sent", async () => {
    expect(await codeOf(updatePromo("p1", { percentOff: 0, kind: "percentage" }, "actor"))).toBe("promo_percent_invalid");
    expect(repo.updatePromo).not.toHaveBeenCalled();
  });

  it("leaves the used-code rule to the repository — it must be decided inside the transaction", async () => {
    repo.updatePromo.mockResolvedValue({ id: "p1" });
    await updatePromo("p1", { percentOff: 30, kind: "percentage" }, "actor");
    expect(repo.updatePromo).toHaveBeenCalled();
  });
});

describe("setStatus", () => {
  it("passes a known status through", async () => {
    repo.setStatus.mockResolvedValue({ id: "p1" });
    await setStatus("p1", "disabled", "actor");
    expect(repo.setStatus).toHaveBeenCalledWith("p1", "disabled", "actor");
  });

  it.each([["archived"], [""], [null], [7]])("refuses %o", async (status) => {
    expect(await codeOf(setStatus("p1", status, "actor"))).toBe("promo_status_invalid");
    expect(repo.setStatus).not.toHaveBeenCalled();
  });
});

describe("readPromo", () => {
  it("404s an unknown id rather than returning null past the service boundary", async () => {
    repo.readPromo.mockResolvedValue(null);
    expect(await codeOf(readPromo("nope"))).toBe("promo_not_found");
  });
});

describe("listPromos coercion", () => {
  beforeEach(() => repo.listPromos.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 }));

  it("drops an unknown status filter instead of refusing the whole list", async () => {
    await listPromos({ status: "haunted" });
    expect(repo.listPromos).toHaveBeenCalledWith(expect.objectContaining({ status: null }));
  });

  it("caps the page size and floors a nonsense page", async () => {
    await listPromos({ page: -3, pageSize: 5000 });
    expect(repo.listPromos).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 100 }));
  });
});

describe("writeOrderPolicy", () => {
  it("writes a valid policy", async () => {
    repo.writeOrderPolicy.mockResolvedValue({ minimumSubtotalAmount: "20.00" });
    await writeOrderPolicy({ minimumSubtotalAmount: "20.00", maxLineQuantity: 10, maxDistinctItems: 50 }, "actor");
    expect(repo.writeOrderPolicy).toHaveBeenCalledWith(
      { minimumSubtotalAmount: "20.00", maxLineQuantity: 10, maxDistinctItems: 50 },
      "actor",
    );
  });

  it.each([
    ["a line ceiling above the cart_item CHECK", { minimumSubtotalAmount: "0.00", maxLineQuantity: 100, maxDistinctItems: 50 }],
    ["a zero line ceiling", { minimumSubtotalAmount: "0.00", maxLineQuantity: 0, maxDistinctItems: 50 }],
    ["a distinct-item ceiling above 500", { minimumSubtotalAmount: "0.00", maxLineQuantity: 10, maxDistinctItems: 501 }],
    ["a negative minimum", { minimumSubtotalAmount: "-1.00", maxLineQuantity: 10, maxDistinctItems: 50 }],
  ])("refuses %s — the schema would reject it when a shopper hit it", async (_label, input) => {
    expect(await codeOf(writeOrderPolicy(input, "actor"))).toBe("order_policy_invalid");
    expect(repo.writeOrderPolicy).not.toHaveBeenCalled();
  });
});

// ── The advertising facet (028 T049) ────────────────────────────────────────────────────────────
//
// ⚠ These prove the SERVICE's half only. The guarantee that an advertised promotion always has a
// headline is `promo_code_banner_copy_chk` in the database, which no unit test can exercise — the
// service check exists so an operator gets a field-level message instead of a 500, not instead of the
// constraint.

describe("advertising a promotion", () => {
  it("defaults to NOT advertised", async () => {
    repo.createPromo.mockResolvedValue({});
    await createPromo({ ...VALID_PERCENT }, "actor");

    const [input] = repo.createPromo.mock.calls.at(-1)!;
    // The default IS the safety control. Private promotions are ordinary — a goodwill credit for one
    // customer, a partner code — and a default of `true` would put every one on the storefront.
    expect(input.isAdvertised).toBe(false);
  });

  it("refuses to advertise a promotion with no headline", async () => {
    expect(await codeOf(createPromo({ ...VALID_PERCENT, isAdvertised: true }, "actor"))).toBe(
      "promo_definition_invalid",
    );
  });

  it("refuses a headline that is only whitespace", async () => {
    expect(
      await codeOf(createPromo({ ...VALID_PERCENT, isAdvertised: true, bannerTitle: "   " }, "actor")),
    ).toBe("promo_definition_invalid");
  });

  it("names the offending field so the operator knows which box is empty", async () => {
    try {
      await createPromo({ ...VALID_PERCENT, isAdvertised: true }, "actor");
      throw new Error("expected a refusal");
    } catch (e) {
      expect(isPromoError(e) && e.fields.map((f) => f.field)).toContain("bannerTitle");
    }
  });

  it("accepts an advertised promotion that has a headline", async () => {
    repo.createPromo.mockResolvedValue({});
    await createPromo(
      { ...VALID_PERCENT, isAdvertised: true, bannerTitle: "20% off your first order" },
      "actor",
    );

    const [input] = repo.createPromo.mock.calls.at(-1)!;
    expect(input.isAdvertised).toBe(true);
    expect(input.bannerTitle).toBe("20% off your first order");
  });

  it("refuses a negative or fractional position", async () => {
    expect(await codeOf(createPromo({ ...VALID_PERCENT, bannerPosition: -1 }, "actor"))).toBe(
      "promo_definition_invalid",
    );
    expect(await codeOf(createPromo({ ...VALID_PERCENT, bannerPosition: 1.5 }, "actor"))).toBe(
      "promo_definition_invalid",
    );
  });

  it("lets a headline be edited on a promotion that is already being used", async () => {
    // ⚠ The point of FR-068 is that a redeemed code's VALUE cannot change, because a paid order's
    // discount was computed from the definition as it stood. A headline is not value — an operator
    // must be able to fix a typo on a promotion people are already redeeming.
    repo.updatePromo.mockResolvedValue({});
    await updatePromo("p1", { bannerTitle: "Corrected headline" }, "actor");

    expect(repo.updatePromo).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ bannerTitle: "Corrected headline" }),
      "actor",
    );
  });
});

// ── Banner artwork conformance + placement (029 T014/T039) ──────────────────────────────────────
//
// ⚠ These prove the SERVICE half. The guarantee that reaches production is this code running against
// a real S3 object; the bypass walk in quickstart §2a — presigning, PUTting a wrong-shaped image
// directly, then saving — is what proves the console is not the guard. No unit test can prove that,
// because the whole point is that the upload never passes through here.

describe("banner artwork conformance", () => {
  it("verifies artwork when a key is saved", async () => {
    repo.updatePromo.mockResolvedValue({});
    media.readObjectPrefix.mockResolvedValue(Buffer.alloc(1));
    imageDimensions.readImageDimensions.mockReturnValue({ width: 1200, height: 600, format: "png" });

    await updatePromo("p1", { bannerImageKey: "promotions/p1/a.png" }, "actor");
    expect(media.readObjectPrefix).toHaveBeenCalledWith("promotions/p1/a.png", expect.any(Number));
  });

  it("refuses artwork that is the wrong size, and says what shape is required", async () => {
    media.readObjectPrefix.mockResolvedValue(Buffer.alloc(1));
    imageDimensions.readImageDimensions.mockReturnValue({ width: 800, height: 800, format: "png" });

    expect(await codeOf(updatePromo("p1", { bannerImageKey: "promotions/p1/sq.png" }, "actor"))).toBe(
      "promo_banner_image_wrong_size",
    );
  });

  it("uses a DISTINCT code from the presign-time refusal", async () => {
    // 028 already emits `promo_banner_image_invalid` for content-type and size refusals at presign.
    // One code for two failure modes leaves the console unable to tell an operator which happened.
    media.readObjectPrefix.mockResolvedValue(Buffer.alloc(1));
    imageDimensions.readImageDimensions.mockReturnValue({ width: 800, height: 800, format: "png" });

    expect(await codeOf(updatePromo("p1", { bannerImageKey: "k" }, "actor"))).not.toBe(
      "promo_banner_image_invalid",
    );
  });

  it("does NOT resize — a wrong-shaped image is refused, never transformed", async () => {
    media.readObjectPrefix.mockResolvedValue(Buffer.alloc(1));
    imageDimensions.readImageDimensions.mockReturnValue({ width: 800, height: 800, format: "png" });

    await codeOf(updatePromo("p1", { bannerImageKey: "k" }, "actor"));
    // ⚠ Silently altering an operator's artwork is precisely the silent crop FR-008 forbids. The
    // proof is negative: the write never happens.
    expect(repo.updatePromo).not.toHaveBeenCalled();
  });

  it("widens the range once when the dimensions sit beyond the first read", async () => {
    // A photo with a large EXIF block is an ORDINARY file, not a broken one. Refusing it would blame
    // an operator for artwork that is fine.
    media.readObjectPrefix
      .mockResolvedValueOnce(Buffer.alloc(1))
      .mockResolvedValueOnce(Buffer.alloc(2));
    imageDimensions.readImageDimensions
      .mockImplementationOnce(() => {
        throw new imageDimensions.DimensionsBeyondBufferError("beyond");
      })
      .mockReturnValueOnce({ width: 1200, height: 600, format: "jpeg" });
    repo.updatePromo.mockResolvedValue({});

    await updatePromo("p1", { bannerImageKey: "k" }, "actor");
    expect(media.readObjectPrefix).toHaveBeenCalledTimes(2);
  });

  it("skips verification entirely when no artwork is being saved", async () => {
    // Artwork is optional (FR-009). A promotion with none must still save.
    repo.updatePromo.mockResolvedValue({});
    await updatePromo("p1", { bannerTitle: "Just copy" }, "actor");
    expect(media.readObjectPrefix).not.toHaveBeenCalled();
  });
});

describe("placement", () => {
  it("defaults to the offers carousel", async () => {
    repo.createPromo.mockResolvedValue({});
    await createPromo({ ...VALID_PERCENT }, "actor");

    const [input] = repo.createPromo.mock.calls.at(-1)!;
    // FR-027a: advertising without choosing must land where shoppers look for offers, not scattered
    // through the merchandising.
    expect(input.bannerPlacement).toBe("carousel");
  });

  it("refuses a placement outside the two", async () => {
    expect(
      await codeOf(createPromo({ ...VALID_PERCENT, bannerPlacement: "sidebar" }, "actor")),
    ).toBe("promo_definition_invalid");
  });

  it("can be changed on a promotion that is already being redeemed", async () => {
    // ⚠ Placement is PRESENTATION. FR-068 freezes a redeemed code's VALUE, because a paid order's
    // discount was computed from it — moving a banner between sections rewrites nothing.
    repo.updatePromo.mockResolvedValue({});
    await updatePromo("p1", { bannerPlacement: "inline" }, "actor");

    expect(repo.updatePromo).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ bannerPlacement: "inline" }),
      "actor",
    );
  });
});
