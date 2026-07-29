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
import { APPS, isStale, orphansFor, sourceFiles } from "./sync-mobile-assets.mjs";

// ⚠ APPS is IMPORTED, not redeclared. This file used to keep its own copy of the list, which meant
// the drift checker could itself drift: adding an app to the sync and forgetting it here would leave
// that surface silently unchecked — the exact class of bug this script exists to catch.

if (sourceFiles().length === 0) {
  console.error("mobile-assets:check: no source assets under packages/design-system/mobile-assets");
  process.exit(1);
}

const problems = [];
let checked = 0;
for (const app of APPS) {
  // Each app declares which KINDS it consumes: driver-mobile takes fonts but not nav icons, because
  // it has no navigation yet. Checking it against the full set would report false MISSINGs.
  const files = sourceFiles(app);
  checked += files.length;
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

console.log(`mobile-assets:check: ${checked} asset copies match across ${APPS.length} apps.`);
