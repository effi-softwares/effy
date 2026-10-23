// Fails if the committed banner template has drifted from src/banner-canvas.json: a stale template turns
// an operator's guess into a confident mistake. Regenerates in memory and compares.
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
