import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// SC-007 / FR-013 guard: shop-web MUST inherit its entire visual identity from the shared design
// system and define NOTHING of its own. A second surface that quietly forks the theme is exactly
// the drift this slice exists to prevent — so assert it mechanically, not by review.
//
// ⚠ 057 NARROWED WHAT "NOTHING OF ITS OWN" MEANS, AND THE GUARD SAYS SO RATHER THAN BEING DELETED.
// shop-web now adopts an imported design's token VALUES (zinc ramp, Geist, a single 8px radius). Those
// values live in `packages/design-system/src/tokens/shop.css` — inside the shared package, checked by
// the same AA guard as the platform SSOT — and shop-web merely imports it. So the invariant is no
// longer "one token file"; it is "shop-web declares no token values IN THE APP". That is the part
// that actually prevents drift, and it is what the assertions below now pin.
//
// (Vitest runs from the app dir → resolve both files from there.)
const appCss = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const tokensCss = readFileSync(
  resolve(process.cwd(), "../../packages/design-system/src/tokens.css"),
  "utf8",
).toLowerCase();

// Strip comments before scanning: prose may legitimately mention a hex or the word "theme".
const appCssCode = appCss.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();

describe("shop-web inherits the design system and defines no theme of its own", () => {
  it("imports the shared tokens", () => {
    expect(appCssCode).toContain('@import "@effy/design-system/tokens.css"');
  });

  // 057: the shop value layer is imported AFTER the platform tokens — order is load-bearing, since
  // it wins by being later. Asserting only that it is imported would let a reorder pass silently.
  it("imports the shop value layer, and after the platform tokens", () => {
    const platform = appCssCode.indexOf('@import "@effy/design-system/tokens.css"');
    const shop = appCssCode.indexOf('@import "@effy/design-system/tokens/shop.css"');
    expect(shop).toBeGreaterThan(-1);
    expect(shop).toBeGreaterThan(platform);
  });

  // ⚠ The values must stay in the shared package. An app-local copy is exactly the Principle II
  // violation the shop layer was designed around, and it would escape check-tokens.mjs entirely.
  it("keeps every adopted value in the shared package, none in the app", () => {
    expect(appCssCode).not.toMatch(/#[0-9a-f]{3,8}\b/);
    expect(appCssCode).not.toMatch(/--(pad|rowpad|font-sans|font-mono)\s*:/);
  });

  it("declares zero colour literals locally", () => {
    expect(appCssCode).not.toMatch(/#[0-9a-f]{3,8}\b/);
    expect(appCssCode).not.toMatch(/\b(rgb|hsl|oklch)a?\(/);
  });

  it("declares no theme tokens and no @theme block of its own", () => {
    expect(appCssCode).not.toMatch(/@theme\b/);
    expect(appCssCode).not.toMatch(/^\s*--(color|sidebar|radius|primary|background)[\w-]*\s*:/m);
  });

  it("declares no root font-size scaling of its own (shadcn defaults, no fluid scaling)", () => {
    expect(appCssCode).not.toMatch(/font-size\s*:\s*clamp\(/);
  });

  // 026: the brand is monochrome. The accent INVERTS between appearances — that is the invariant
  // most likely to be "simplified" away by someone who assumes one accent value, so assert it.
  it("resolves the monochrome accent from the shared source, inverting by appearance", () => {
    expect(tokensCss).toMatch(/--primary:\s*#171717/); // light: near-black (adopted, feature 041)
    expect(tokensCss).toMatch(/--primary:\s*#e5e5e5/); // dark: near-white
    expect(tokensCss).toMatch(/--primary-foreground:\s*#fafafa/);
    expect(tokensCss).toMatch(/--primary-foreground:\s*#171717/);
  });

  // 041: charts are the ONE place non-monochrome colour is allowed, and never as text.
  it("carries the bounded data-visualisation palette with no foreground pair", () => {
    expect(tokensCss).toMatch(/--chart-1:\s*#/);
    expect(tokensCss).not.toContain("--chart-1-foreground");
  });

  it("has fully retired both prior brand palettes (Jade and Effy Emerald)", () => {
    for (const hex of ["#0fb57e", "#047857", "#065f46", "#d0735a", "#bf5540", "#dd8368"]) {
      expect(tokensCss, `retired brand value ${hex} is still present`).not.toContain(hex);
    }
  });
});
