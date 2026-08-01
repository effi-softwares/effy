import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  searchLocalities: vi.fn(),
  localitiesForPostcode: vi.fn(),
}));
vi.mock("./repository", () => repo);

import { postcodeCoverage, searchLocalities } from "./localities";
import { isDeliveryError } from "./types";

/**
 * ⚠ THE NUMBERS IN THIS FILE COME FROM THE REAL DATASET, NOT FROM THE CODE.
 *
 * Postcode 3350 covers **20** Ballarat localities and 3550 covers **12** in Bendigo — confirmed
 * against the live `public.locality` table before any of this was written (031 T002), and recorded in
 * the contract's worked table. 3000 covers exactly **one** place, which is the sole-candidate case.
 *
 * This matters because 028 and 029 both shipped tests whose fixtures agreed with the code rather than
 * with the world, and 030's contract test asserted a payload the server never sent. A disclosure that
 * says "19 other places" is only correct if 20 is actually true.
 */
const BALLARAT_3350 = Array.from({ length: 20 }, (_, i) => ({
  name: `Ballarat Suburb ${i + 1}`,
  state: "VIC",
  postcode: "3350",
}));

const MELBOURNE_3000 = [{ name: "Melbourne", state: "VIC", postcode: "3000" }];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("searchLocalities", () => {
  it("searches by name prefix", async () => {
    repo.searchLocalities.mockResolvedValue(BALLARAT_3350);
    await searchLocalities("ballarat");
    expect(repo.searchLocalities).toHaveBeenCalledWith("ballarat", expect.any(Number));
    expect(repo.localitiesForPostcode).not.toHaveBeenCalled();
  });

  /** The server classifies the input, so no caller has to decide what it is holding (FR-006). */
  it("treats a 4-digit input as a postcode, not a name", async () => {
    repo.localitiesForPostcode.mockResolvedValue(BALLARAT_3350);
    await searchLocalities("3350");
    expect(repo.localitiesForPostcode).toHaveBeenCalledWith("3350");
    expect(repo.searchLocalities).not.toHaveBeenCalled();
  });

  it("rejects input too short to be a question, without touching the database", async () => {
    await expect(searchLocalities("b")).rejects.toSatisfy(isDeliveryError);
    expect(repo.searchLocalities).not.toHaveBeenCalled();
    expect(repo.localitiesForPostcode).not.toHaveBeenCalled();
  });

  it("bounds the result set so the list stays scannable", async () => {
    repo.searchLocalities.mockResolvedValue([]);
    await searchLocalities("bal");
    const call = repo.searchLocalities.mock.calls[0];
    expect(call).toBeDefined();
    const limit = call![1] as number;
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(50);
  });
});

describe("postcodeCoverage — the data behind the FR-006 disclosure", () => {
  /**
   * ⚠ The single most important assertion in this file.
   *
   * An admin choosing "Alfredton" is choosing all twenty Ballarat localities, because serviceability
   * is decided by postcode. If this count is wrong the disclosure lies, and the admin believes they
   * made a narrow decision when they made a broad one.
   */
  it("reports every place a postcode covers, with a count", async () => {
    repo.localitiesForPostcode.mockResolvedValue(BALLARAT_3350);
    const result = await postcodeCoverage("3350");

    expect(result.postcode).toBe("3350");
    expect(result.count).toBe(20);
    expect(result.places).toHaveLength(20);
  });

  /**
   * ⚠ `count` must equal the number of places, because the rendered sentence is `count - 1`
   * ("19 other places"). A count that disagrees with the list is a sentence that lies.
   */
  it("keeps count and places in agreement", async () => {
    repo.localitiesForPostcode.mockResolvedValue(BALLARAT_3350);
    const result = await postcodeCoverage("3350");
    expect(result.count).toBe(result.places.length);
  });

  /** FR-034a's sole-candidate case: 3000 covers only Melbourne, so there is nothing else to disclose. */
  it("reports a sole-candidate postcode as covering one place", async () => {
    repo.localitiesForPostcode.mockResolvedValue(MELBOURNE_3000);
    const result = await postcodeCoverage("3000");
    expect(result.count).toBe(1);
  });

  /**
   * ⚠ THE 3001 CASE — the defect that motivated this whole feature.
   *
   * An empty result is NOT an error: it means no locality names this postcode, because 3001 is
   * Melbourne's PO-box code and has no street addresses. The caller warns and asks for confirmation;
   * it does not refuse (FR-005), because the reference record can lag reality and a hard block would
   * stall legitimate operations work.
   */
  it("returns an EMPTY coverage for a postcode no locality names, without erroring", async () => {
    repo.localitiesForPostcode.mockResolvedValue([]);
    const result = await postcodeCoverage("3001");

    expect(result.count).toBe(0);
    expect(result.places).toEqual([]);
  });

  it("rejects something that is not a postcode", async () => {
    await expect(postcodeCoverage("ballarat")).rejects.toSatisfy(isDeliveryError);
    await expect(postcodeCoverage("335")).rejects.toSatisfy(isDeliveryError);
    expect(repo.localitiesForPostcode).not.toHaveBeenCalled();
  });

  /** ⚠ NT postcodes begin 08xx and must survive as text — a number would make 0800 into 800. */
  it("accepts a leading-zero postcode", async () => {
    repo.localitiesForPostcode.mockResolvedValue([
      { name: "Darwin", state: "NT", postcode: "0800" },
    ]);
    const result = await postcodeCoverage("0800");
    expect(result.postcode).toBe("0800");
  });
});
