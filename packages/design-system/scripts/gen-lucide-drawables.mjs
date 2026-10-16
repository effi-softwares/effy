// GENERATOR — converts the Lucide icons the customer app uses into Android/Compose vector drawables
// (087 research D4). Lucide is the icon set of the storefront identity (the web and the design canvas
// use it); the customer mobile app takes the same glyphs.
//
// Usage: node scripts/gen-lucide-drawables.mjs <path-to-lucide-static>/icons
//   (`npm pack lucide-static@0.469.0` and untar it; the version is pinned below so a re-run is
//   reproducible). Output: mobile-assets/drawable/lucide_<name>.xml, then run mobile-assets:sync.
//
// ⚠ The output is COMMITTED and the source is not: Lucide is a build-time input, like the Geist TTFs.
// The licence travels with the files (mobile-assets/drawable/LUCIDE-LICENSE.txt).
//
// Lucide draws with strokes only (fill none, stroke 2, round caps and joins). A vector drawable can
// stroke a <path>, so every primitive (circle, rect, line, polyline, polygon, ellipse) is rewritten as
// path data. The stroke colour is black; screens tint it (Icon(tint = …)).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const LUCIDE_VERSION = "0.469.0";

/** Every Lucide glyph the customer (087) and driver (092) apps draw. Add a name here, re-run, sync. */
export const ICONS = [
  "arrow-right", "arrow-up-down", "bell", "bell-off", "check", "chevron-down", "chevron-left", "chevron-right",
  "chevron-up", "circle-alert", "circle-check", "circle-help", "clock", "coins", "copy", "credit-card",
  "eye", "eye-off", "file-text", "gift", "heart", "history", "house", "image", "info", "key-round",
  "list-plus", "lock", "log-out", "mail", "map-pin", "message-square", "minus", "package", "pencil",
  "plus", "receipt", "refresh-cw", "search", "settings", "shield", "shopping-bag", "shopping-cart",
  "sliders-horizontal", "smartphone", "sparkles", "store", "tag", "trash-2", "triangle-alert", "truck",
  "user-round", "wifi-off", "x",
  // Aisles (087 T057) — the 084 aisle keys mapped to food-first glyphs.
  "apple", "baby", "beef", "carrot", "coffee", "cookie", "croissant", "cup-soda", "egg", "fish",
  "milk", "paw-print", "pill", "sandwich", "snowflake", "soup", "spray-can", "wheat", "wine",
  "shopping-basket", "scroll-text", "sun-moon",
  // 092 — the driver app's redesign canvas (Navigate, Call, the hub, scanning, proof, offline).
  "arrow-left", "camera", "circle-x", "cloud-off", "door-open", "ellipsis", "external-link", "flashlight",
  "flashlight-off", "hand", "inbox", "keyboard", "list-checks", "navigation", "pause", "pen-line", "phone",
  "refresh-ccw", "rotate-ccw", "scan-line", "signature", "undo-2", "warehouse", "power",
];

const num = (s) => Number.parseFloat(s);
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
};

function circlePath(cx, cy, r) {
  return `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
}
function ellipsePath(cx, cy, rx, ry) {
  return `M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${2 * rx},0a${rx},${ry} 0 1,0 ${-2 * rx},0`;
}
function rectPath(x, y, w, h, rx, ry) {
  if (!rx && !ry) return `M${x},${y}h${w}v${h}h${-w}z`;
  rx = Math.min(rx ?? ry, w / 2);
  ry = Math.min(ry ?? rx, h / 2);
  return (
    `M${x + rx},${y}h${w - 2 * rx}a${rx},${ry} 0 0 1 ${rx},${ry}v${h - 2 * ry}` +
    `a${rx},${ry} 0 0 1 ${-rx},${ry}h${-(w - 2 * rx)}a${rx},${ry} 0 0 1 ${-rx},${-ry}` +
    `v${-(h - 2 * ry)}a${rx},${ry} 0 0 1 ${rx},${-ry}z`
  );
}
function pointsPath(points, close) {
  const nums = points.trim().split(/[\s,]+/).map(num);
  let d = "";
  for (let i = 0; i < nums.length; i += 2) d += `${i === 0 ? "M" : "L"}${nums[i]},${nums[i + 1]}`;
  return close ? `${d}z` : d;
}

export function convert(svg, name) {
  const paths = [];
  for (const m of svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*\/?>/g)) {
    const tag = m[0];
    switch (m[1]) {
      case "path": paths.push(attr(tag, "d")); break;
      case "circle": paths.push(circlePath(num(attr(tag, "cx") ?? 0), num(attr(tag, "cy") ?? 0), num(attr(tag, "r")))); break;
      case "ellipse": paths.push(ellipsePath(num(attr(tag, "cx") ?? 0), num(attr(tag, "cy") ?? 0), num(attr(tag, "rx")), num(attr(tag, "ry")))); break;
      case "rect": {
        const rx = attr(tag, "rx"), ry = attr(tag, "ry");
        paths.push(rectPath(num(attr(tag, "x") ?? 0), num(attr(tag, "y") ?? 0), num(attr(tag, "width")), num(attr(tag, "height")),
          rx === undefined ? undefined : num(rx), ry === undefined ? undefined : num(ry)));
        break;
      }
      case "line": paths.push(`M${num(attr(tag, "x1") ?? 0)},${num(attr(tag, "y1") ?? 0)}L${num(attr(tag, "x2") ?? 0)},${num(attr(tag, "y2") ?? 0)}`); break;
      case "polyline": paths.push(pointsPath(attr(tag, "points"), false)); break;
      case "polygon": paths.push(pointsPath(attr(tag, "points"), true)); break;
    }
  }
  if (paths.length === 0 || paths.some((p) => !p)) throw new Error(`gen-lucide-drawables: could not convert ${name}`);
  const body = paths
    .map((d) => `    <path android:pathData="${d}" android:fillColor="#00000000" android:strokeColor="#FF000000" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" />`)
    .join("\n");
  // ⚠ No XML comment before <vector>: the non-Android resource parser is minimal; provenance lives in
  // LUCIDE-LICENSE.txt and this script.
  return `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
${body}
</vector>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const src = process.argv[2];
  if (!src || !existsSync(src)) {
    console.error("usage: node scripts/gen-lucide-drawables.mjs <lucide-static>/icons");
    process.exit(1);
  }
  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../mobile-assets/drawable");
  for (const name of ICONS) {
    const file = join(src, `${name}.svg`);
    if (!existsSync(file)) throw new Error(`gen-lucide-drawables: no ${name}.svg in ${src}`);
    writeFileSync(join(out, `lucide_${name.replaceAll("-", "_")}.xml`), convert(readFileSync(file, "utf8"), name));
  }
  console.log(`gen-lucide-drawables: ${ICONS.length} icons written to mobile-assets/drawable/`);
}
