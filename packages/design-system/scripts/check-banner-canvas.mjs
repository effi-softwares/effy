// Assert the promotional banner canvas is internally coherent (029 T008).
//
// This is a constants file, so the failures it can have are arithmetic ones — and every one of them
// would surface as a bad banner on a shopper's phone rather than as an error anyone could debug. A
// text zone that runs off the canvas, a ratio that disagrees with the dimensions it is derived from,
// a render bound smaller than a phone: each is a one-character mistake with a device-only symptom.
//
// Runs under `pnpm test` in this package.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = JSON.parse(readFileSync(resolve(here, "../../shared-types/src/banner-canvas.json"), "utf8"));

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

const { width, height, aspectRatio, maxBytes, maxRenderWidthDp, textZone } = canvas;

// ── The canvas itself ───────────────────────────────────────────────────────────────────────────
check(Number.isInteger(width) && width > 0, `width must be a positive integer, got ${width}`);
check(Number.isInteger(height) && height > 0, `height must be a positive integer, got ${height}`);

// ⚠ THE load-bearing invariant. The render box is locked to `aspectRatio` and conformant artwork is
// locked to width/height; if those two disagree, artwork is stretched at every size — which is the one
// thing FR-013 forbids outright.
check(
  Math.abs(width / height - aspectRatio) < 1e-9,
  `aspectRatio ${aspectRatio} disagrees with ${width}/${height} = ${width / height}. ` +
    "Artwork would be stretched at every window width.",
);

// 2:1 is the decision (research R1); anything markedly taller starts crowding a screen whose job is
// showing products, and 028's FR-017 caps a Home section at half the viewport.
check(aspectRatio >= 1.5, `aspectRatio ${aspectRatio} is too tall for a Home banner (FR-017's 50% cap)`);

// ── Density headroom ────────────────────────────────────────────────────────────────────────────
// A ~370dp render width at 3× is ~1110 physical px. Below that the banner renders soft on a modern
// phone, which is the sort of thing nobody notices until it is everywhere.
check(width >= 1110, `width ${width} is below the 3×-density floor (~1110px) and will render soft`);

// ── The text zone ───────────────────────────────────────────────────────────────────────────────
const { insetLeftPct, insetBottomPct, widthPct, heightPct } = textZone;
for (const [name, value] of Object.entries(textZone)) {
  if (name.startsWith("$")) continue;
  check(typeof value === "number" && value >= 0 && value <= 100, `textZone.${name} must be 0–100, got ${value}`);
}
check(
  insetLeftPct + widthPct <= 100,
  `textZone runs off the right edge: ${insetLeftPct}% + ${widthPct}% = ${insetLeftPct + widthPct}%`,
);
check(
  insetBottomPct + heightPct <= 100,
  `textZone runs off the top edge: ${insetBottomPct}% + ${heightPct}% = ${insetBottomPct + heightPct}%`,
);

// A zone too small to hold a headline, a terms line and a code chip is a promise the renderer cannot
// keep — the copy would overflow the area the operator was told to keep quiet.
check(widthPct >= 40, `textZone is only ${widthPct}% wide — too narrow for a headline plus a code`);
check(heightPct >= 30, `textZone is only ${heightPct}% tall — too short for three lines of copy`);

// ── Render and file bounds ──────────────────────────────────────────────────────────────────────
// Below a phone's width the bound would clamp on the device it was meant to leave alone.
check(
  maxRenderWidthDp >= 420,
  `maxRenderWidthDp ${maxRenderWidthDp} is narrower than a large phone; the bound would apply on phones`,
);
check(maxBytes > 0 && maxBytes <= 1024 * 1024, `maxBytes ${maxBytes} is not a sane banner ceiling`);

if (problems.length > 0) {
  console.error("banner-canvas:check: src/banner-canvas.json is not coherent:\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  process.exit(1);
}

console.log(
  `banner-canvas:check: ${width} × ${height} (${aspectRatio}:1), text zone ${widthPct}×${heightPct}% — coherent.`,
);
