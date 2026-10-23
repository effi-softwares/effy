// Generates the operator's promotional banner template from src/banner-canvas.json: a file to design
// on, so no banner comes out 1200 × 601. Guarded by check-banner-template.mjs.
// Regenerate: pnpm --filter @effy/design-system banner-template:gen
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CANVAS = JSON.parse(readFileSync(resolve(here, "../../shared-types/src/banner-canvas.json"), "utf8"));
const OUT = resolve(here, "../banner/banner-template.svg");

/** The template an operator downloads. Renders in any browser and opens in any design tool. */
export function renderTemplate(canvas = CANVAS) {
  const { width, height, textZone } = canvas;

  // The text zone in absolute px, anchored lower-left.
  const zoneW = Math.round((width * textZone.widthPct) / 100);
  const zoneH = Math.round((height * textZone.heightPct) / 100);
  const zoneX = Math.round((width * textZone.insetLeftPct) / 100);
  const zoneY = height - zoneH - Math.round((height * textZone.insetBottomPct) / 100);

  // Deliberately plain (light ground, dashed outline, two labels): anything decorative would end up in a banner.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>Effy promotional banner template — ${width} × ${height}</title>
  <desc>Design your artwork on this canvas. The dashed area carries the promotion's text; keep it visually quiet.</desc>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f2f2f2"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#c8c8c8" stroke-width="1"/>
  <rect x="${zoneX}" y="${zoneY}" width="${zoneW}" height="${zoneH}" fill="#ffffff" fill-opacity="0.55" stroke="#8a8a8a" stroke-width="2" stroke-dasharray="12 8"/>
  <text x="${zoneX + 16}" y="${zoneY + 34}" font-family="system-ui, sans-serif" font-size="26" fill="#4a4a4a">Text is drawn here — keep this area quiet</text>
  <text x="${zoneX + 16}" y="${zoneY + 70}" font-family="system-ui, sans-serif" font-size="20" fill="#6a6a6a">Canvas ${width} × ${height} · artwork must be exactly this size</text>
</svg>
`;
}

// A canvas whose stated ratio disagrees with its dimensions would teach the wrong shape.
const derived = CANVAS.width / CANVAS.height;
if (Math.abs(derived - CANVAS.aspectRatio) > 1e-9) {
  console.error(
    `gen-banner-template: banner-canvas.json is self-inconsistent — ${CANVAS.width}/${CANVAS.height} ` +
      `is ${derived}, but aspectRatio says ${CANVAS.aspectRatio}.`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, renderTemplate());
  console.log(`banner-template:gen: wrote ${OUT} (${CANVAS.width} × ${CANVAS.height})`);
}

export { OUT, CANVAS };
