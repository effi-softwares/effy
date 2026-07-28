// Fail if any app's copy of the shared mobile assets has drifted from the authored source, and NAME
// the stale surface.
//
// Three failure modes, all of which have bitten this repo before (024 SC-008 proved the same three for
// packages/brand by deliberately causing each):
//
//   STALE    — an app's copy differs from the source (someone hand-edited the copy, or forgot to sync)
//   MISSING  — an app has no copy at all (a new asset was authored and never synced)
//   ORPHANED — an app has an asset the source does not declare (a rename left the old file behind, so
//              the app still compiles while referencing something nobody maintains)
//
// The third is the sneaky one: an orphan breaks nothing and shows up in no build log.

import { existsSync } from "node:fs";
import { isStale, orphansFor, sourceFiles } from "./sync-mobile-assets.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const APPS = [
  { name: "customer-mobile", root: resolve(here, "../../../apps/customer-mobile/shared/src/commonMain/composeResources") },
  { name: "shop-mobile", root: resolve(here, "../../../apps/shop-mobile/shared/src/commonMain/composeResources") },
];

const files = sourceFiles();
if (files.length === 0) {
  console.error("mobile-assets:check: no source assets under packages/design-system/mobile-assets");
  process.exit(1);
}

const problems = [];
for (const app of APPS) {
  for (const file of files) {
    const target = `${app.root}/${file.kind}/${file.name}`;
    if (!existsSync(target)) {
      problems.push(`MISSING  ${app.name}: ${file.kind}/${file.name}`);
    } else if (isStale(app, file)) {
      problems.push(`STALE    ${app.name}: ${file.kind}/${file.name}`);
    }
  }
  for (const orphan of orphansFor(app, files)) {
    problems.push(`ORPHANED ${app.name}: ${orphan.kind}/${orphan.name} — not declared by mobile-assets/`);
  }
}

if (problems.length > 0) {
  console.error("mobile-assets:check: the committed mobile assets do not match the authored source:\n");
  problems.forEach((p) => console.error(`  ${p}`));
  console.error("\nFix: edit packages/design-system/mobile-assets/, then run");
  console.error("     pnpm --filter @effy/design-system mobile-assets:sync");
  process.exit(1);
}

console.log(`mobile-assets:check: ${files.length} assets match across ${APPS.length} apps.`);
