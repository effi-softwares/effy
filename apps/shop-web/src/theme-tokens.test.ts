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

  it("resolves Effy Emerald #065f46 as the single brand accent (Jade retired), from the shared source", () => {
    expect(tokensCss).toContain("#065f46");
    expect(tokensCss).not.toContain("#0fb57e");
    expect(tokensCss).not.toContain("#047857");
  });
});
