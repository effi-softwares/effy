import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const announce = vi.fn();
vi.mock("../lib/db", () => ({ query: (...a: unknown[]) => query(...a) }));
vi.mock("./announce", () => ({ announce: (...a: unknown[]) => announce(...a) }));

const { announceTaxonomy } = await import("./taxonomy");

describe("announceTaxonomy (101)", () => {
  beforeEach(() => {
    query.mockReset();
    announce.mockReset();
  });

  it("tells back-office and every active shop", async () => {
    query.mockResolvedValue({ rows: [{ id: "s1" }, { id: "s2" }] });
    await announceTaxonomy();
    expect(announce).toHaveBeenCalledWith([
      { scope: "ops", kind: "taxonomy" },
      { scope: "shop", shopId: "s1", kind: "taxonomy" },
      { scope: "shop", shopId: "s2", kind: "taxonomy" },
    ]);
  });

  it("still tells back-office when the shops cannot be read, and never throws", async () => {
    query.mockRejectedValue(new Error("down"));
    await expect(announceTaxonomy()).resolves.toBeUndefined();
    expect(announce).toHaveBeenCalledWith([{ scope: "ops", kind: "taxonomy" }]);
  });
});
