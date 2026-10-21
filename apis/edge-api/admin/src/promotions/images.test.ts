import { beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => {
  class MediaValidationError extends Error {
    constructor(message: string, readonly fields: { field: string; message: string }[]) {
      super(message);
    }
  }
  const tx = { query: vi.fn() };
  return {
    MediaValidationError,
    tx,
    query: vi.fn(),
    withTransaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    presignUpload: vi.fn(),
    isMediaValidationError: (e: unknown) => e instanceof MediaValidationError,
    readObjectPrefix: vi.fn(),
    readImageDimensions: vi.fn(),
    isUnsupportedImage: (e: unknown) => (e as Error)?.message === "unsupported",
    isDimensionsBeyondBuffer: () => false,
    publicImageUrl: (k: string) => `https://media.test/${k}`,
    imageWidthsField: () => ({}),
    renditionWidthsSql: () => "NULL",
  };
});
vi.mock("@effy/edge-shared", () => shared);
vi.mock("@effy/edge-shared/live", () => ({ announce: vi.fn() }));

const { addImage, removeImage, uploadUrl } = await import("./images");

const P = "11111111-1111-4111-8111-111111111111";
const I = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  shared.query.mockResolvedValue({ rowCount: 1, rows: [] });
});

describe("095 — pictures on a promotion", () => {
  it("refuses a file that is not a JPEG, PNG or WebP, or too large, with a sentence", async () => {
    shared.presignUpload.mockRejectedValue(new shared.MediaValidationError("bad", [{ field: "contentType", message: "must be an image" }]));
    await expect(uploadUrl(P, { contentType: "application/pdf", fileSize: 10 })).rejects.toMatchObject({ status: 422, code: "invalid_upload", message: expect.stringContaining("10 MB") });
  });

  it("asks for a description", async () => {
    await expect(addImage(P, { storageKey: `promotions/${P}/a.jpg`, alt: " " }, "s")).rejects.toMatchObject({ status: 422, fields: [expect.objectContaining({ field: "alt" })] });
  });

  it("only records a file uploaded for this promotion", async () => {
    await expect(addImage(P, { storageKey: "products/x/a.jpg", alt: "A basket" }, "s")).rejects.toMatchObject({ fields: [expect.objectContaining({ field: "storageKey" })] });
  });

  it("refuses something that is not a picture, and a picture too small to show", async () => {
    shared.readObjectPrefix.mockResolvedValue(Buffer.from("x"));
    shared.readImageDimensions.mockImplementationOnce(() => { throw new Error("unsupported"); });
    await expect(addImage(P, { storageKey: `promotions/${P}/a.jpg`, alt: "A basket" }, "s")).rejects.toMatchObject({ code: "not_a_picture" });
    shared.readImageDimensions.mockReturnValueOnce({ width: 200, height: 900 });
    await expect(addImage(P, { storageKey: `promotions/${P}/a.jpg`, alt: "A basket" }, "s")).rejects.toMatchObject({ code: "picture_too_small" });
  });

  it("holds at most ten pictures (counted under the promotion lock)", async () => {
    shared.readObjectPrefix.mockResolvedValue(Buffer.from("x"));
    shared.readImageDimensions.mockReturnValue({ width: 1600, height: 900 });
    shared.tx.query.mockImplementation(async (sql: string) => (sql.includes("count(*)") ? { rows: [{ n: 10 }] } : { rowCount: 1, rows: [] }));
    await expect(addImage(P, { storageKey: `promotions/${P}/a.jpg`, alt: "A basket" }, "s")).rejects.toMatchObject({ status: 409, code: "too_many_images" });
  });

  it("removing a picture a group shows asks first, naming the group", async () => {
    shared.tx.query.mockImplementation(async (sql: string) =>
      sql.includes("JOIN public.promotion_group") ? { rows: [{ id: "g", key: "home-hero", name: "Home hero" }] } : { rowCount: 1, rows: [] },
    );
    await expect(removeImage(P, I, false, "s")).rejects.toMatchObject({ status: 409, code: "image_in_use", message: "This picture is shown in Home hero." });
    await expect(removeImage(P, I, true, "s")).resolves.toBeUndefined();
  });
});
