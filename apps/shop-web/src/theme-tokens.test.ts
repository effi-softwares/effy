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

    // ⚠ 057's "imports the shop value layer, and after the platform tokens" assertion is DELETED, not
  // relaxed. That file no longer exists: the theme adoption made its values the platform's, so a
  // test demanding a second import would now fail for the right reason and be "fixed" by recreating
  // the very duplication the adoption removed. Its replacement is the assertion below — exactly one
  // token file is imported.
  it("imports exactly one token file", () => {
    expect(appCssCode.match(/@import "@effy\/design-system\/tokens/g)).toHaveLength(1);
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

  // ⚠ THE PLATFORM IS NO LONGER MONOCHROME, and this test says so rather than being deleted. It used
  // to assert a near-black/near-white accent that INVERTED by appearance. The adopted accent is a
  // cobalt hue, which reads against both grounds and therefore LIFTS rather than inverting — a
  // distinction worth pinning, because "restoring" an inversion here would put a dark-on-dark fill
  // in the dark theme.
  it("resolves the cobalt action colour from the shared source, lifting (not inverting) in dark", () => {
    expect(tokensCss).toMatch(/--primary:\s*#1d4ed8/); // light
    expect(tokensCss).toMatch(/--primary:\s*#4d7cff/); // dark — brighter, same hue
    // --primary and --brand are ONE fact: the action colour. Equal on purpose (see tokens.css).
    expect(tokensCss).toMatch(/--brand:\s*#1d4ed8/);
  });

  // The attention hue is deliberately rare, and deliberately NOT the action colour. If these two
  // ever resolve to the same value, every "needs attention" affordance has silently become a CTA.
  it("keeps the attention hue distinct from the action colour", () => {
    const brand = tokensCss.match(/--brand:\s*(#[0-9a-f]{6})/)?.[1];
    const attention = tokensCss.match(/--accent2:\s*(#[0-9a-f]{6})/)?.[1];
    expect(brand).toBeTruthy();
    expect(attention).toBeTruthy();
    expect(attention).not.toBe(brand);
  });

  // Charts carry hues, and never as text-on-fill.
  it("carries the bounded data-visualisation palette with no foreground pair", () => {
    expect(tokensCss).toMatch(/--chart-1:\s*#/);
    expect(tokensCss).not.toContain("--chart-1-foreground");
  });

  // ⚠ --success and --warning may be text ON THEIR TINT but never a fill with a label on it. The
  // structural guarantee is the ABSENCE of a paired foreground token — without one there is nothing
  // to write on the solid with. check-tokens.mjs enforces it for --success; this pins both.
  it("gives the non-fill semantics no foreground pair", () => {
    expect(tokensCss).not.toContain("--success-foreground");
    expect(tokensCss).not.toContain("--warning-foreground");
  });

  it("has fully retired both prior brand palettes (Jade and Effy Emerald)", () => {
    for (const hex of ["#0fb57e", "#047857", "#065f46", "#d0735a", "#bf5540", "#dd8368"]) {
      expect(tokensCss, `retired brand value ${hex} is still present`).not.toContain(hex);
    }
  });
});
