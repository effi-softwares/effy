// Fail if the committed banner template has drifted from src/banner-canvas.json.
//
// ⚠ The template's ENTIRE value is that it agrees with the renderer. An operator designs onto it and
// trusts the result will fit; a stale template is worse than none, because it converts a guess into a
// confident mistake.
//
// Same shape as check-compose-theme.mjs: regenerate in memory, compare against what is committed, and
// say plainly what is stale.
import { existsSync, readFileSync } from "node:fs";

import { CANVAS, OUT, renderTemplate } from "./gen-banner-template.mjs";

if (!existsSync(OUT)) {
  console.error(`banner-template:check: ${OUT} is MISSING.`);
  console.error("Fix: pnpm --filter @effy/design-system banner-template:gen");
  process.exit(1);
}

const committed = readFileSync(OUT, "utf8");
const expected = renderTemplate();

if (committed !== expected) {
  console.error("banner-template:check: the committed template no longer matches banner-canvas.json.");
  console.error(`  stale: ${OUT}`);
  console.error(`  canvas is now ${CANVAS.width} × ${CANVAS.height} (ratio ${CANVAS.aspectRatio})`);
  console.error("\nFix: pnpm --filter @effy/design-system banner-template:gen");
  process.exit(1);
}

console.log(`banner-template:check: template matches the canvas (${CANVAS.width} × ${CANVAS.height}).`);
