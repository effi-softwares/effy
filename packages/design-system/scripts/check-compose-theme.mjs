// Verify that every committed Compose theme is already the exact output of the token generator.
// This deliberately compares file contents rather than `git diff`, so intentional uncommitted work and
// Git staging state cannot produce a false failure.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const targets = [
  resolve(here, "../compose/EffyTokens.kt"),
  resolve(here, "../compose-shop/EffyTokens.kt"),
  resolve(here, "../compose-driver/EffyTokens.kt"),
];
const before = new Map(
  targets.map((target) => [target, existsSync(target) ? readFileSync(target, "utf8") : null]),
);

const generated = spawnSync(process.execPath, [resolve(here, "gen-compose-theme.mjs")], {
  stdio: "inherit",
});
if (generated.status !== 0) process.exit(generated.status ?? 1);

const drifted = targets.filter(
  (target) => before.get(target) === null || before.get(target) !== readFileSync(target, "utf8"),
);
if (drifted.length > 0) {
  console.error("tokens:check: generated Compose themes were stale:");
  drifted.forEach((target) => console.error(`  - ${target}`));
  console.error("Regenerated the files; review and commit the resulting changes.");
  process.exit(1);
}

console.log("tokens:check: all Compose themes match tokens.css.");
