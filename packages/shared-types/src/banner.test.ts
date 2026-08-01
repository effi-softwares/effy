import { describe, expect, it } from "vitest";

import { BANNER_CANVAS, bannerCanvasLabel, isCanonicalBannerRatio, isCanonicalBannerSize } from "./banner";

/**
 * 029 — the canvas helpers.
 *
 * `isCanonicalBannerRatio` is the gate that decides whether artwork can be SCALED (safe) or would
 * have to be CROPPED (refused, FR-008). Getting it wrong in either direction is a real failure: too
 * strict and legitimate exports are rejected; too loose and the console silently crops.
 */
describe("banner canvas helpers", () => {
  it("states the size without anyone typing it", () => {
    expect(bannerCanvasLabel()).toBe(`${BANNER_CANVAS.width} × ${BANNER_CANVAS.height}`);
  });

  it("accepts the exact canvas", () => {
    expect(isCanonicalBannerSize(BANNER_CANVAS.width, BANNER_CANVAS.height)).toBe(true);
  });

  it("rejects anything that is not the exact canvas", () => {
    expect(isCanonicalBannerSize(BANNER_CANVAS.width, BANNER_CANVAS.height - 1)).toBe(false);
  });

  it("accepts artwork already at the canonical ratio, at any size", () => {
    // These SCALE cleanly — composition intact, no crop.
    expect(isCanonicalBannerRatio(1200, 600)).toBe(true);
    expect(isCanonicalBannerRatio(2400, 1200)).toBe(true);
    expect(isCanonicalBannerRatio(800, 400)).toBe(true);
  });

  it("tolerates an export that is 2:1 in every sense a person cares about", () => {
    // A 1999×1000 export is 2:1. Refusing it would be pedantry an operator cannot act on.
    expect(isCanonicalBannerRatio(1999, 1000)).toBe(true);
  });

  it("refuses shapes that would have to be cropped", () => {
    // ⚠ The important half. A square cannot become 2:1 without cutting something off, and cropping
    // the operator did not ask for is exactly what FR-008 forbids.
    expect(isCanonicalBannerRatio(1000, 1000)).toBe(false);
    expect(isCanonicalBannerRatio(1600, 900)).toBe(false); // 16:9 — close, and still a crop
    expect(isCanonicalBannerRatio(600, 1200)).toBe(false); // portrait
  });

  it("refuses degenerate dimensions rather than dividing by zero", () => {
    expect(isCanonicalBannerRatio(0, 600)).toBe(false);
    expect(isCanonicalBannerRatio(1200, 0)).toBe(false);
    expect(isCanonicalBannerRatio(-1200, -600)).toBe(false);
  });
});
