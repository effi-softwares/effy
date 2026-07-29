import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// SC-007 / FR-013 guard: shop-web MUST inherit its entire visual identity from the shared design
// system and define NOTHING of its own. A second surface that quietly forks the theme is exactly
// the drift this slice exists to prevent — so assert it mechanically, not by review.
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
    expect(tokensCss).toMatch(/--primary:\s*#1a1a1a/); // light: near-black
    expect(tokensCss).toMatch(/--primary:\s*#f5f5f5/); // dark: near-white
    expect(tokensCss).toMatch(/--primary-foreground:\s*#ffffff/);
    expect(tokensCss).toMatch(/--primary-foreground:\s*#1a1a1a/);
  });

  it("has fully retired both prior brand palettes (Jade and Effy Emerald)", () => {
    for (const hex of ["#0fb57e", "#047857", "#065f46", "#d0735a", "#bf5540", "#dd8368"]) {
      expect(tokensCss, `retired brand value ${hex} is still present`).not.toContain(hex);
    }
  });
});
