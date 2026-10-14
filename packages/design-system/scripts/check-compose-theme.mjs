// Verify that every committed Compose theme is already the exact output of the token generator.
// This deliberately compares file contents rather than `git diff`, so intentional uncommitted work and
// Git staging state cannot produce a false failure.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// ⚠ EVERY file the generator writes must be listed here, or it is unguarded.
//
// 025 added the EffyLayoutTokens.kt half (the audience-neutral spacing + radius vocabulary that
// packages/mobile-kit consumes). A generated file missing from this list can be hand-edited and drift
// from tokens.css silently, which is precisely the failure the whole generate-and-check pattern
// exists to make impossible.
const targets = [
  resolve(here, "../compose/EffyTokens.kt"),
  resolve(here, "../compose-shop/EffyTokens.kt"),
  resolve(here, "../compose-driver/EffyTokens.kt"),
  resolve(here, "../compose/EffyLayoutTokens.kt"),
  resolve(here, "../compose-shop/EffyLayoutTokens.kt"),
  resolve(here, "../compose-driver/EffyLayoutTokens.kt"),
  resolve(here, "../compose/EffyTypography.kt"),
  resolve(here, "../compose-shop/EffyTypography.kt"),
  // 087 — the driver typography was generated since 026 and never listed here (unguarded), and the
  // customer app's storefront shapes are new.
  resolve(here, "../compose-driver/EffyTypography.kt"),
  resolve(here, "../compose/EffyStorefrontShape.kt"),
  // 051 — the payment provider's Appearance for both customer surfaces. The payment step is the one
  // screen where a third party draws pixels inside ours, so a hand edit here would put the card
  // fields on a second, unchecked copy of the brand. Listed so that cannot happen silently.
  resolve(here, "../stripe/appearance.ts"),
  resolve(here, "../stripe/storefront-appearance.ts"),
  resolve(here, "../compose-payment-android/EffyPaymentAppearance.kt"),
  resolve(here, "../../../apps/customer-mobile/iosApp/iosApp/EffyPaymentAppearance.swift"),
];
const before = new Map(
  targets.map((target) => [target, existsSync(target) ? readFileSync(target, "utf8") : null]),
);

// ⚠ EVERY generator whose output is listed above must run here, or its files are compared against
// themselves and the check passes trivially. 051 added the second generator.
for (const generator of ["gen-compose-theme.mjs", "gen-stripe-appearance.mjs"]) {
  const generated = spawnSync(process.execPath, [resolve(here, generator)], { stdio: "inherit" });
  if (generated.status !== 0) process.exit(generated.status ?? 1);
}

const drifted = targets.filter(
  (target) => before.get(target) === null || before.get(target) !== readFileSync(target, "utf8"),
);
if (drifted.length > 0) {
  console.error("tokens:check: generated brand artifacts were stale:");
  drifted.forEach((target) => console.error(`  - ${target}`));
  console.error("Regenerated the files; review and commit the resulting changes.");
  process.exit(1);
}

// 087 — the customer app wears the STOREFRONT identity (five values, light + a mobile dark). One failure
// the regenerate-and-diff above cannot see, because it would be faithfully generated: a colour the
// storefront file does not declare.
{
  const customer = readFileSync(resolve(here, "../compose/EffyTokens.kt"), "utf8");
  const storefront = readFileSync(resolve(here, "../src/storefront/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const declared = new Set([...storefront.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => m[1].toUpperCase()));
  const problems = [];
  // 087 / v3.4.0: the customer theme HAS a dark scheme now (the storefront's mobile dark appearance);
  // what must still hold is that every colour in it is one the storefront file declares.
  for (const m of customer.matchAll(/Color\(0x([0-9A-F]{2})([0-9A-F]{6})\)/g)) {
    if (m[1] === "FF" && !declared.has(m[2])) problems.push(`#${m[2]} is not declared in storefront/tokens.css`);
  }
  if (problems.length > 0) {
    console.error("tokens:check: the customer app's theme left the storefront identity:");
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
}

console.log(`tokens:check: all ${targets.length} generated files match tokens.css.`);
