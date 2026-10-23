// Fails, naming the surface, when an app's copy of the shared mobile assets is stale (differs), missing,
// or orphaned (an asset the source does not declare, which breaks nothing and is never noticed).

import { existsSync } from "node:fs";
import { APPS, isStale, orphansFor, sourceFiles } from "./sync-mobile-assets.mjs";

const files = sourceFiles();
if (files.length === 0) {
  console.error("mobile-assets:check: no source assets under packages/design-system/mobile-assets");
  process.exit(1);
}

const problems = [];
let checked = 0;
for (const app of APPS) {
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
