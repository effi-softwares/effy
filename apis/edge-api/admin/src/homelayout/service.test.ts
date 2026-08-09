import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  readLayout: vi.fn(),
  writeDraft: vi.fn(),
  publish: vi.fn(),
  revert: vi.fn(),
  readAudit: vi.fn(),
}));
vi.mock("./repository", () => repo);

// The storefront cache call reaches the network; mocked at the module boundary like the repository.
const revalidate = vi.hoisted(() => ({ revalidateStorefront: vi.fn() }));
vi.mock("./revalidate", () => revalidate);

import { getLayout, publish, revert, saveDraft } from "./service";
import { isLayoutError, LayoutError } from "./types";

const layout = (over: Partial<Record<string, unknown>> = {}) => ({
  draft: [],
  published: [],
  revision: 3,
  publishedAt: null,
  publishedBy: null,
  updatedAt: "2026-08-09T00:00:00Z",
  updatedBy: null,
  ...over,
});

const block = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  type: "app_promo",
  props: { headline: "The Effy app is on its way" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.readLayout.mockResolvedValue(layout());
  repo.writeDraft.mockImplementation(async (body: unknown) => layout({ draft: body, revision: 4 }));
  repo.publish.mockImplementation(async () => layout({ revision: 4 }));
  repo.revert.mockImplementation(async () => layout({ revision: 4 }));
  revalidate.revalidateStorefront.mockResolvedValue(undefined);
});

describe("reading the layout", () => {
  /**
   * ⚠ 503, NOT 404, when the row is missing. The migration seeds it, so absence means an unapplied
   * migration — and an operator told "not found" goes looking for a layout to create, which is
   * neither the problem nor something they can fix.
   */
  it("fails loudly when the singleton row does not exist", async () => {
    repo.readLayout.mockResolvedValue(null);
    await expect(getLayout()).rejects.toMatchObject({ status: 503, code: "layout_unavailable" });
  });
});

describe("saving a draft", () => {
  it("never touches what shoppers see", async () => {
    await saveDraft([block()], 3, "sub-1");
    expect(repo.writeDraft).toHaveBeenCalledTimes(1);
    expect(repo.publish).not.toHaveBeenCalled();
    // ⚠ And it must not invalidate the storefront cache either. A draft save that busted the cache
    // would send every shopper's next request to the database for a page that has not changed.
    expect(revalidate.revalidateStorefront).not.toHaveBeenCalled();
  });

  it("passes the revision through so a stale write can be refused", async () => {
    await saveDraft([block()], 7, "sub-1");
    expect(repo.writeDraft).toHaveBeenCalledWith([expect.objectContaining({ id: "b1" })], 7, "sub-1");
  });

  /**
   * ⚠ A DRAFT IS WORK IN PROGRESS AND IS NOT CONTENT-VALIDATED. An operator who has added a tile and
   * not yet written its headline must be able to save and come back — refusing that would make the
   * draft useless as a draft. What a draft may never be is un-parseable, because that corrupts the
   * composer itself.
   */
  it("accepts a block with missing required content", async () => {
    await expect(saveDraft([block({ props: {} })], 3, "sub-1")).resolves.toBeDefined();
  });

  it("refuses a body that is not an array", async () => {
    await expect(saveDraft({ nope: true }, 3, "sub-1")).rejects.toMatchObject({
      code: "layout_not_an_array",
    });
  });

  it("refuses a block with no id, rather than inventing one", async () => {
    // ⚠ An invented id would make the operator's next reorder move a block they cannot identify, and
    // an audit entry point at something that did not exist when it was written.
    await expect(saveDraft([{ type: "app_promo", props: {} }], 3, "sub-1")).rejects.toMatchObject({
      code: "block_missing_id",
    });
  });

  /**
   * ⚠ A DUPLICATE ID IS NOT COSMETIC. The id is the React key in the composer and the anchor for a
   * move — two blocks sharing one makes the composer reorder the wrong block, which looks like a UI
   * bug for as long as anyone cares to investigate.
   */
  it("refuses two blocks that share an id", async () => {
    await expect(
      saveDraft([block({ id: "same" }), block({ id: "same" })], 3, "sub-1"),
    ).rejects.toMatchObject({ code: "block_duplicate_id" });
  });

  it("refuses more blocks than the ceiling allows", async () => {
    const many = Array.from({ length: 21 }, (_, i) => block({ id: `b${i}` }));
    await expect(saveDraft(many, 3, "sub-1")).rejects.toMatchObject({
      code: "layout_too_many_blocks",
    });
  });

  it("keeps the hidden flag when it is set, and omits it otherwise", async () => {
    await saveDraft([block({ hidden: true }), block({ id: "b2" })], 3, "sub-1");
    const written = repo.writeDraft.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(written[0]!.hidden).toBe(true);
    // ⚠ Not `false` — a shown block must be byte-identical to one that was never hidden, or the same
    // layout has two encodings and a diff reports changes nobody made.
    expect("hidden" in written[1]!).toBe(false);
  });
});

describe("publishing", () => {
  it("copies the draft to published and tells the storefront", async () => {
    repo.readLayout.mockResolvedValue(layout({ draft: [block()] }));
    await publish(3, "sub-1");
    expect(repo.publish).toHaveBeenCalledWith(3, "sub-1");
    expect(revalidate.revalidateStorefront).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠ THE CONTENT RULES ARE ENFORCED HERE, ON PUBLISH — not in the composer's form. The operator can
   * reach this API directly and the storefront has to live with whatever ends up stored, so a rule
   * that exists only in a form is not a rule (FR-032).
   */
  it("refuses a layout whose required copy is missing, naming the block and field", async () => {
    repo.readLayout.mockResolvedValue(layout({ draft: [block({ props: {} })] }));
    const err = await publish(3, "sub-1").catch((e: unknown) => e);
    expect(isLayoutError(err)).toBe(true);
    expect((err as LayoutError).status).toBe(422);
    // ⚠ "This layout is invalid" is not something an operator can act on. Which block, which field.
    expect((err as LayoutError).issues[0]).toMatchObject({
      blockId: "b1",
      field: "headline",
      code: "field_required",
    });
    expect(repo.publish).not.toHaveBeenCalled();
  });

  it("refuses copy that is longer than the field allows", async () => {
    repo.readLayout.mockResolvedValue(
      layout({ draft: [block({ props: { headline: "x".repeat(200) } })] }),
    );
    const err = await publish(3, "sub-1").catch((e: unknown) => e);
    expect((err as LayoutError).issues[0]).toMatchObject({ code: "field_too_long" });
  });

  it("refuses a block type this platform does not define", async () => {
    repo.readLayout.mockResolvedValue(layout({ draft: [block({ type: "custom_html" })] }));
    const err = await publish(3, "sub-1").catch((e: unknown) => e);
    expect((err as LayoutError).issues[0]).toMatchObject({ code: "unknown_block_type" });
  });

  /**
   * ⚠ A HIDDEN BLOCK IS NOT VALIDATED, and that is the point of hiding (FR-005). Refusing to publish
   * the page because a hidden block is incomplete would make hiding useless exactly when it is
   * needed — the operator's only alternative would be to delete the block and lose its content, which
   * is the thing hiding exists to prevent.
   */
  it("ignores an incomplete block that is hidden", async () => {
    repo.readLayout.mockResolvedValue(layout({ draft: [block({ props: {}, hidden: true })] }));
    await expect(publish(3, "sub-1")).resolves.toBeDefined();
    expect(repo.publish).toHaveBeenCalled();
  });

  /**
   * ⚠ A REVALIDATION FAILURE REACHES THE OPERATOR. This is the deliberate inverse of 038's Cognito
   * interceptor, which never throws — there the fallback is a working plain email. Here the fallback
   * is "shoppers keep seeing the old page while the console says you published", which is a lie the
   * operator has no way to detect. Told about it they can retry; not told, they cannot.
   */
  it("surfaces a failure to refresh the storefront rather than swallowing it", async () => {
    repo.readLayout.mockResolvedValue(layout({ draft: [block()] }));
    revalidate.revalidateStorefront.mockRejectedValue(
      new LayoutError(502, "revalidation_failed", "published, but the storefront refused the refresh"),
    );
    await expect(publish(3, "sub-1")).rejects.toMatchObject({ code: "revalidation_failed" });
    // ⚠ The publish itself DID commit — which is why the message says "published, but…". Reporting it
    // as a plain failure would send the operator to re-do work that is already done.
    expect(repo.publish).toHaveBeenCalled();
  });
});

describe("reverting", () => {
  it("discards the draft and invalidates the cache", async () => {
    await revert(3, "sub-1");
    expect(repo.revert).toHaveBeenCalledWith(3, "sub-1");
    expect(revalidate.revalidateStorefront).toHaveBeenCalledTimes(1);
  });

  it("does not validate — you must be able to abandon a layout that cannot be published", async () => {
    // The whole point of discarding is to escape a state you do not want. Validating on the way out
    // would trap an operator inside a half-finished block with no way back to what is live.
    repo.readLayout.mockResolvedValue(layout({ draft: [block({ props: {} })] }));
    await expect(revert(3, "sub-1")).resolves.toBeDefined();
  });
});

describe("validating inside a list (the offers bento)", () => {
  const tile = (over: Record<string, unknown> = {}) => ({
    size: "large",
    headline: "Save on the weekly shop",
    ctaLabel: "See the deals",
    ctaDestination: { kind: "sale" },
    ctaStyle: "button",
    artwork: "home/tile-1.jpg",
    altText: "A basket of fresh vegetables",
    ...over,
  });
  const offers = (tiles: unknown[]) => ({ id: "o1", type: "offers", props: { title: "Offers", tiles } });

  const publishWith = async (tiles: unknown[]) => {
    repo.readLayout.mockResolvedValue(layout({ draft: [offers(tiles)] }));
    return publish(3, "sub-1").catch((e: unknown) => e);
  };

  it("accepts a complete tile", async () => {
    repo.readLayout.mockResolvedValue(layout({ draft: [offers([tile()])] }));
    await expect(publish(3, "sub-1")).resolves.toBeDefined();
  });

  /**
   * ⚠ THIS IS THE HOLE THAT EXISTED BEFORE THE VALIDATOR RECURSED. Walking only the top level meant
   * an `offers` block was checked for "does it have a tiles array" and nothing else — so a tile with
   * no headline published cleanly and rendered as an empty frame in the middle of the storefront.
   * Every rule that matters for the bento lives one level down.
   */
  it("refuses a tile with no headline, naming the tile and the field", async () => {
    const err = (await publishWith([tile({ headline: "" })])) as LayoutError;
    expect(err.status).toBe(422);
    expect(err.issues[0]).toMatchObject({ field: "tiles.0.headline", code: "field_required" });
  });

  it("names the RIGHT tile when a later one is incomplete", async () => {
    // ⚠ "A tile is incomplete" is unusable when there are six of them. The index is the whole point.
    const err = (await publishWith([tile(), tile({ ctaLabel: "" })])) as LayoutError;
    expect(err.issues[0]!.field).toBe("tiles.1.ctaLabel");
  });

  it("refuses a tile size the bento cannot lay out", async () => {
    const err = (await publishWith([tile({ size: "enormous" })])) as LayoutError;
    expect(err.issues[0]).toMatchObject({ field: "tiles.0.size", code: "field_not_an_option" });
  });

  it("refuses more tiles than the bento composes", async () => {
    const err = (await publishWith(Array.from({ length: 7 }, () => tile()))) as LayoutError;
    expect(err.issues[0]).toMatchObject({ field: "tiles", code: "list_out_of_range" });
  });

  it("refuses a tiles entry that is not an object at all", async () => {
    const err = (await publishWith(["just a string"])) as LayoutError;
    expect(err.issues[0]).toMatchObject({ field: "tiles.0", code: "list_item_malformed" });
  });
});

describe("artwork must be described (FR-026)", () => {
  const tile = (over: Record<string, unknown> = {}) => ({
    size: "large",
    headline: "Save on the weekly shop",
    ctaLabel: "See the deals",
    ctaDestination: { kind: "sale" },
    ctaStyle: "button",
    artwork: "home/tile-1.jpg",
    ...over,
  });
  const withTiles = (tiles: unknown[]) =>
    layout({ draft: [{ id: "o1", type: "offers", props: { title: "Offers", tiles } }] });

  /**
   * ⚠ THIS CLOSES A DEFECT THE PLATFORM HAS SHIPPED SINCE PROMOTIONAL BANNERS EXISTED. Both
   * storefront banner components hardcode `alt=""` — artwork declared DECORATIVE — while the canvas
   * definition carries a marked TEXT ZONE, i.e. the platform stating in its own contract that the
   * artwork carries the message. A screen-reader user gets nothing from a block a sighted shopper
   * reads a headline off.
   */
  it("refuses artwork with neither a description nor a decorative declaration", async () => {
    repo.readLayout.mockResolvedValue(withTiles([tile()]));
    const err = (await publish(3, "sub-1").catch((e: unknown) => e)) as LayoutError;
    expect(err.issues[0]).toMatchObject({ field: "tiles.0.altText", code: "artwork_not_described" });
  });

  it("accepts a description", async () => {
    repo.readLayout.mockResolvedValue(withTiles([tile({ altText: "A basket of vegetables" })]));
    await expect(publish(3, "sub-1")).resolves.toBeDefined();
  });

  /**
   * ⚠ The opt-out is REAL, not a formality. Forcing alt text onto genuinely decorative artwork
   * produces the opposite failure — a screen reader announcing "abstract green pattern" between every
   * offer. What the rule forbids is SILENCE, which is what the platform does today by default.
   */
  it("accepts an explicit decorative declaration instead", async () => {
    repo.readLayout.mockResolvedValue(withTiles([tile({ decorative: true })]));
    await expect(publish(3, "sub-1")).resolves.toBeDefined();
  });

  it("does not demand a description for a tile that has no artwork yet", async () => {
    // That tile has its own missing-artwork issue; two messages for one omission is noise.
    repo.readLayout.mockResolvedValue(withTiles([tile({ artwork: undefined })]));
    const err = (await publish(3, "sub-1").catch((e: unknown) => e)) as LayoutError;
    expect(err.issues.map((i) => i.code)).toEqual(["field_required"]);
  });

  it("treats whitespace as no description at all", async () => {
    repo.readLayout.mockResolvedValue(withTiles([tile({ altText: "   " })]));
    const err = (await publish(3, "sub-1").catch((e: unknown) => e)) as LayoutError;
    expect(err.issues[0]).toMatchObject({ code: "artwork_not_described" });
  });
});
