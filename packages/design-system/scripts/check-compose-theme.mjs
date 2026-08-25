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
  // 051 — the payment provider's Appearance for both customer surfaces. The payment step is the one
  // screen where a third party draws pixels inside ours, so a hand edit here would put the card
  // fields on a second, unchecked copy of the brand. Listed so that cannot happen silently.
  resolve(here, "../stripe/appearance.ts"),
  resolve(here, "../compose-payment-android/EffyPaymentAppearance.kt"),
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

console.log(`tokens:check: all ${targets.length} generated files match tokens.css.`);
