import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renditionUrl } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

import { isOriginalKey, renditionKey, widthsFor } from "./widths";

describe("widthsFor (086 FR-013)", () => {
  it.each([
    [3000, [160, 320, 640, 1280]],
    [1281, [160, 320, 640, 1280]],
    [1280, [160, 320, 640, 1280]],
    [1000, [160, 320, 640, 1000]],
    [500, [160, 320, 500]],
    [160, [160]],
    [120, [120]],
    [1, [1]],
    [0, []],
  ])("%i px → %j", (source, expected) => {
    expect(widthsFor(source)).toEqual(expected);
  });
});

describe("renditionKey names what clients ask for", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtures = JSON.parse(
    readFileSync(resolve(here, "../../../../../packages/shared-types/src/media.fixtures.json"), "utf8"),
  ) as { cases: { name: string; imageUrl: string; width: number; throws?: boolean }[] };

  it.each(fixtures.cases.filter((c) => !c.throws).map((c) => [c.name, c] as const))("%s", (_, c) => {
    const url = new URL(c.imageUrl);
    // The key a client's address points at is the key this worker writes.
    const key = decodeURIComponent(url.pathname.slice(1));
    expect(`${url.origin}/${encodeURI(renditionKey(key, c.width))}`).toBe(renditionUrl(c.imageUrl, c.width));
  });
});

describe("isOriginalKey", () => {
  it.each(["products/o/a.jpg", "promotions/p/a.png"])("accepts %s", (k) => expect(isOriginalKey(k)).toBe(true));
  it.each(["renditions/products/o/a/w160.webp", "proof/d/a.jpg", "courier-label/p/a.pdf", "products/../proof/a.jpg", ""])(
    "refuses %j",
    (k) => expect(isOriginalKey(k)).toBe(false),
  );
});
