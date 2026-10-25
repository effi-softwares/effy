import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const targets = [
  resolve(here, "../compose/EffyTokens.kt"),
  resolve(here, "../compose-driver/EffyTokens.kt"),
  resolve(here, "../compose/EffyLayoutTokens.kt"),
  resolve(here, "../compose-driver/EffyLayoutTokens.kt"),
  resolve(here, "../compose/EffyTypography.kt"),
  resolve(here, "../compose-driver/EffyTypography.kt"),
  resolve(here, "../compose/EffyStorefrontShape.kt"),
  resolve(here, "../compose-driver/EffyStorefrontShape.kt"),
  resolve(here, "../stripe/storefront-appearance.ts"),
  resolve(here, "../compose-payment-android/EffyPaymentAppearance.kt"),
  resolve(here, "../../../apps/customer-mobile/iosApp/iosApp/EffyPaymentAppearance.swift"),
];
const before = new Map(
  targets.map((target) => [target, existsSync(target) ? readFileSync(target, "utf8") : null]),
);

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

{
  const customer = readFileSync(resolve(here, "../compose/EffyTokens.kt"), "utf8");
  const storefront = readFileSync(resolve(here, "../src/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const declared = new Set([...storefront.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => m[1].toUpperCase()));
  const problems = [];
  for (const m of customer.matchAll(/Color\(0x([0-9A-F]{2})([0-9A-F]{6})\)/g)) {
    if (m[1] === "FF" && !declared.has(m[2])) problems.push(`#${m[2]} is not declared in tokens.css`);
  }
  if (problems.length > 0) {
    console.error("tokens:check: the customer app's theme left the storefront identity:");
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
}

console.log(`tokens:check: all ${targets.length} generated files match tokens.css.`);
