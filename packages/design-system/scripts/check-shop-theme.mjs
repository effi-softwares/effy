// SHOP THEME COVERAGE GUARD — 057 (T036). Zero-dependency, same philosophy as check-tokens.mjs.
//
// ⚠ WHAT THIS CATCHES THAT check-tokens.mjs CANNOT. That guard checks each token file in isolation:
// every var present in both appearances, every pair clearing WCAG AA. Both files pass it today. But
// shop.css is an OVERRIDE layer loaded after tokens.css, and a var it fails to override does not
// error — it silently keeps the PLATFORM value. The result is a zinc console with one leftover
// bIkeymG neutral in it: a surface that is 95% one ramp and 5% another, in a place nobody looks,
// with every existing guard green.
//
// That is this repository's most-repeated defect shape — 033's `available` beside a five-way verdict,
// 052's `summarizeFulfillment` beside `stage.go`, 053's `problem.fields` beside `errors`: two sources
// for one fact, free to disagree, with nothing failing. So the rule is stated mechanically instead:
//
//   EVERY colour var the platform layer defines MUST be redefined by the shop layer, in BOTH
//   appearances. A deliberate omission is not expressible — and that is the point.
//
// ⚠ It deliberately does NOT check the reverse (a shop var with no platform counterpart). The shop
// layer legitimately adds --pad and --rowpad, which the platform has no equivalent for.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function parseBlock(css, selector, file) {
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "gm");
  const out = {};
  let m;
  // ⚠ Iterated with /g rather than matched once: shop.css declares `:root` TWICE (colours, then the
  // scale + type block). A single match would read only the first and report every scale token as
  // missing — a false failure is as corrosive as a false pass.
  while ((m = re.exec(css)) !== null) {
    for (const line of m[1].split("\n")) {
      const hex = line.match(/^\s*--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
      if (hex) out[hex[1]] = hex[2].toLowerCase();
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`check-shop-theme: no '${selector}' declarations in ${file}`);
  }
  return out;
}

const platformCss = readFileSync(resolve(here, "../src/tokens.css"), "utf8");
const shopCss = readFileSync(resolve(here, "../src/tokens/shop.css"), "utf8");

const errors = [];

for (const [appearance, selector] of [
  ["light", ":root"],
  ["dark", ".dark"],
]) {
  const platform = parseBlock(platformCss, selector, "tokens.css");
  const shop = parseBlock(shopCss, selector, "tokens/shop.css");

  for (const name of Object.keys(platform)) {
    if (!(name in shop)) {
      errors.push(
        `[${appearance}] --${name} is defined by tokens.css but NOT overridden by tokens/shop.css. ` +
          `shop-web would silently inherit the platform value (${platform[name]}), mixing two neutral ` +
          `ramps on one surface. Add it to src/tokens/shop.css.`,
      );
    }
  }
}

// ⚠ The corpus assertion. 054's `TestRailsCarryOnlyAvailableProducts` passed VACUOUSLY once its rails
// emptied; a guard whose input silently becomes empty asserts nothing while still reporting OK.
const lightCount = Object.keys(parseBlock(platformCss, ":root", "tokens.css")).length;
if (lightCount < 20) {
  errors.push(`only ${lightCount} platform vars parsed — the guard is not reading tokens.css properly`);
}

if (errors.length) {
  console.error("check-shop-theme: FAILED\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log(
  `check-shop-theme: OK — shop layer overrides all ${lightCount} platform colour vars in both appearances`,
);
