import { beforeAll, describe, expect, it } from "vitest";

import { starterSettings } from "@effy/shared-types";

import { resolveSkin, type PictureRow, type Placement, type SkinRow } from "./skins";

/** 095 — which skin and picture a placement wears (research R3, FR-016). */
const classic: SkinRow = { id: "classic", layout: "classic", settings: {}, version: 1 };
const panel: SkinRow = { id: "panel", layout: "panel", settings: starterSettings("panel"), version: 3 };
const code: SkinRow = { id: "code", layout: "header_card", settings: starterSettings("header_card"), version: 1 };
const photo: SkinRow = { id: "photo", layout: "full_picture", settings: starterSettings("full_picture"), version: 2 };
const skins = new Map([classic, panel, code, photo].map((s) => [s.id, s]));

const at = (over: Partial<Placement> = {}): Placement => ({
  size: "medium", memberSkinId: null, defaultSkinId: "classic", defaultCodeSkinId: null, imageId: null, ...over,
});
const pic = (id: string, width: number, height: number, position: number): PictureRow => ({
  id, promotionId: "p", storageKey: `promotions/p/${id}.jpg`, width, height, alt: `${id} picture`, focusX: 0.5, focusY: 0.4, position, widths: [320, 640],
});

beforeAll(() => {
  process.env.MEDIA_PUBLIC_BASE_URL = "https://media.example.test";
});

describe("resolveSkin", () => {
  it("wears the group default, as classic with no settings", () => {
    expect(resolveSkin(at(), false, skins, [])).toEqual({ id: "classic", version: 1, layout: "classic", size: "medium" });
  });

  it("the member's own skin wins over both defaults", () => {
    expect(resolveSkin(at({ memberSkinId: "panel", defaultCodeSkinId: "code" }), true, skins, [])?.id).toBe("panel");
  });

  it("a promotion with a code wears the code default; one without, the default", () => {
    expect(resolveSkin(at({ defaultCodeSkinId: "code" }), true, skins, [])?.id).toBe("code");
    expect(resolveSkin(at({ defaultCodeSkinId: "code" }), false, skins, [])?.id).toBe("classic");
  });

  it("a skin that cannot be found falls back to the group default", () => {
    expect(resolveSkin(at({ memberSkinId: "gone" }), false, skins, [])?.id).toBe("classic");
  });

  it("carries the picture, its copies and its focus", () => {
    const dto = resolveSkin(at({ memberSkinId: "photo" }), false, skins, [pic("square", 900, 900, 0), pic("wide", 1600, 900, 1)]);
    expect(dto?.picture).toEqual({
      url: "https://media.example.test/promotions/p/wide.jpg", imageWidths: [320, 640], width: 1600, height: 900,
      alt: "wide picture", focusX: 0.5, focusY: 0.4,
    });
  });

  it("the member's chosen picture wins; a removed one falls back to the best fit; none → no picture", () => {
    const pics = [pic("square", 900, 900, 0), pic("wide", 1600, 900, 1)];
    expect(resolveSkin(at({ memberSkinId: "photo", imageId: "square" }), false, skins, pics)?.picture?.alt).toBe("square picture");
    expect(resolveSkin(at({ memberSkinId: "photo", imageId: "gone" }), false, skins, pics)?.picture?.alt).toBe("wide picture");
    expect(resolveSkin(at({ memberSkinId: "photo" }), false, skins, [])?.picture).toBeUndefined();
  });

  it("a layout whose picture is switched off shows none", () => {
    expect(resolveSkin(at({ memberSkinId: "panel" }), false, skins, [pic("wide", 1600, 900, 0)])?.picture).toBeUndefined();
  });
});
