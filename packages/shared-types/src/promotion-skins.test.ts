import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buttonWords,
  coloursFor,
  contrastRatio,
  DESIGNED_LAYOUTS,
  labelWords,
  layoutFits,
  pickPicture,
  RADIUS_PX,
  skinContrast,
  skinGeometry,
  skinProblems,
  SPACING_PX,
  starterSettings,
  TEXT_PX,
  validateSkin,
  WEIGHT_NUM,
  type DesignedLayout,
  type GroupSize,
  type PictureChoice,
  type SkinSettings,
} from "./promotion-skins";

const here = dirname(fileURLToPath(import.meta.url));
interface Fixtures {
  constants: unknown;
  geometry: { layout: DesignedLayout; size: GroupSize; expect: unknown }[];
  words: { layout: DesignedLayout; hasCode: boolean; settings: SkinSettings; expect: unknown }[];
  contrast: { name: string; layout: DesignedLayout; settings: SkinSettings; expect: unknown }[];
  pick: { name: string; layout: DesignedLayout; settings: SkinSettings; pictures: PictureChoice[]; chosenId: string | null; expect: string | null }[];
  appearance: { name: string; settings: SkinSettings; expect: string }[];
}
const fixtures = JSON.parse(readFileSync(resolve(here, "promotion-skins.fixtures.json"), "utf8")) as Fixtures;
const MOBILE = resolve(
  here,
  "../../../apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/catalog/PromoSkinFixture.kt",
);

describe("promotion skins — the fixtures both renderers are held to", () => {
  it("constants", () => {
    expect(fixtures.constants).toEqual({ textPx: TEXT_PX, spacingPx: SPACING_PX, radiusPx: RADIUS_PX, weight: WEIGHT_NUM });
  });
  it.each(fixtures.geometry)("geometry $layout at $size", (c) => {
    expect(skinGeometry(c.layout, c.size)).toEqual(c.expect);
  });
  it.each(fixtures.words)("words $layout code=$hasCode", (c) => {
    expect({ button: buttonWords(c.settings, c.hasCode), label: labelWords(c.settings, c.hasCode) }).toEqual(c.expect);
  });
  it.each(fixtures.contrast)("contrast: $name", (c) => {
    expect(skinContrast(c.layout, c.settings)).toEqual(c.expect);
  });
  it.each(fixtures.pick)("picture: $name", (c) => {
    expect(pickPicture(c.layout, c.settings, c.pictures, c.chosenId)?.id ?? null).toBe(c.expect);
  });
  it.each(fixtures.appearance)("appearance: $name", (c) => {
    expect(coloursFor(c.settings, "dark").background.colour).toBe(c.expect);
  });
  it("the app's copy of the fixtures is this file", () => {
    const kt = readFileSync(MOBILE, "utf8");
    const embedded = kt.slice(kt.indexOf('"""') + 3, kt.lastIndexOf('"""')).trim();
    expect(JSON.parse(embedded)).toEqual(fixtures);
  });
});

describe("validateSkin", () => {
  it.each(DESIGNED_LAYOUTS)("every starter of %s is valid and readable", (layout) => {
    expect(skinProblems(layout, starterSettings(layout))).toEqual({ issues: [], unreadable: [] });
  });

  it("refuses an unknown layout, an unknown key, a bad colour and an out-of-range number", () => {
    expect(validateSkin("canvas", {})).toEqual([{ field: "layout", message: expect.any(String) }]);
    const s = { ...starterSettings("panel"), sparkle: true, headline: { ...starterSettings("panel").headline, colour: "blue" } } as unknown;
    const fields = validateSkin("panel", s).map((i) => i.field);
    expect(fields).toContain("sparkle");
    expect(fields).toContain("headline.colour");
    const t = { ...starterSettings("full_picture"), background: { colour: "#000000", picture: "show", tint: { colour: "#000000", strength: 2 } } };
    expect(validateSkin("full_picture", t).map((i) => i.field)).toContain("background.tint.strength");
  });

  it("refuses a layout's field on another layout, and what a layout cannot show", () => {
    expect(validateSkin("panel", { ...starterSettings("panel"), textCorner: "center" }).map((i) => i.field)).toContain("textCorner");
    expect(validateSkin("tile", { ...starterSettings("tile"), supporting: { ...starterSettings("tile").supporting, show: true } }).map((i) => i.field)).toContain("supporting.show");
    expect(validateSkin("strip", { ...starterSettings("strip"), headline: { ...starterSettings("strip").headline, lines: 2 } }).map((i) => i.field)).toContain("headline.lines");
  });

  it("⚠ words over a picture need a tint (FR-010)", () => {
    const s = starterSettings("full_picture");
    const { tint: _tint, ...noTint } = s.background;
    expect(validateSkin("full_picture", { ...s, background: noTint }).map((i) => i.field)).toContain("background.tint");
  });

  it("button and label words: auto, own words, none", () => {
    const s = starterSettings("panel");
    expect(buttonWords(s, true)).toBe("Copy code");
    expect(buttonWords(s, false)).toBe("View offer");
    expect(buttonWords({ button: { ...s.button, style: "none" } }, true)).toBeNull();
    expect(labelWords({ label: { ...s.label, show: false } }, true)).toBeNull();
  });
});

describe("skinContrast", () => {
  it("measures like WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#1d4ed8", "#ffffff")).toBeGreaterThanOrEqual(6.7);
  });

  it("judges text over a picture against the tint over black AND white", () => {
    const pairs = skinContrast("full_picture", starterSettings("full_picture")).map((p) => p.pair);
    expect(pairs).toEqual(expect.arrayContaining(["headline/picture-dark", "headline/picture-light", "headline/background"]));
  });

  it("dark colours are judged too", () => {
    const s: SkinSettings = { ...starterSettings("panel"), dark: { background: { colour: "#fde047", picture: "none" } } };
    expect(skinProblems("panel", s).unreadable.some((p) => p.pair.startsWith("dark:"))).toBe(true);
  });

  it("only fitting sizes have geometry", () => {
    for (const layout of DESIGNED_LAYOUTS) {
      for (const size of ["large", "medium", "small", "strip"] as const) {
        expect(skinGeometry(layout, size) !== null).toBe(layoutFits(layout, size));
      }
    }
  });
});
