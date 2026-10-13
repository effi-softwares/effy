// COMPOSITIONS — geometry and ground only. No colourway knowledge.
//
// A composition says HOW the mark sits inside a square frame: how much of the frame it occupies,
// what (if anything) is behind it, whether that ground has rounded corners, and whether the result
// keeps its alpha channel.
//
// Compositions are declared by OCCUPANCY, not by padding, because occupancy is the thing platform
// rules actually constrain (Android's safe zone, the maskable circle). Padding is derived:
//
//     side       = maxContentDimension × (1 + 2p)
//     occupancy  = maxContentDimension / side = 1 / (1 + 2p)
//     ⇒  p       = (1/occupancy − 1) / 2
//
// The mark is LANDSCAPE ("e." — about 4:3), so width is the binding dimension and occupancy is
// measured against it.

/** Ground colours. Light/dark follow the design system's surfaces; they are not brand accents. */
export const GROUND = {
  tile: "#09090b", // the mark's own tile — overridden by the colourway wherever it is used
  black: "#000000", // iOS tinted source wants maximum luminance range
}

/**
 * How much of a tile the mark fills, and how round the tile's corners are (as a share of its side).
 * Both are the favicon's own numbers: the letter and its full stop span 31 of 64 units, on a tile
 * with a 14-unit corner.
 */
export const TILE_OCCUPANCY = 0.48
export const TILE_RADIUS = 0.22

/**
 * SPLASH GROUND — the opening screen's ground, per mobile app.
 *
 * ⚠ It is ONE colour per app, not a light/dark pair: the mark's tile has no appearance variant.
 * Both iOS colorset entries (generated from this) and both Android `values/` and `values-night/`
 * `splash_background` colours (hand-maintained — keep them equal to this) carry the same value.
 *
 * ⚠ Asset-local, exactly like the colourways: NOT design tokens, and no Compose theme knows they
 * exist. The app paints its own surface immediately after.
 */
export const SPLASH_GROUND = {
  // The tile's own ground, so the launcher icon opens into the splash without a change of colour.
  "customer-mobile": "#09090b",
  "shop-mobile": "#09090b",
}

export function splashGroundFor(app) {
  const g = SPLASH_GROUND[app]
  if (!g) throw new Error(`no splash ground declared for app '${app}'`)
  return g
}

/**
 * ⚠ RULE P1 — Android's adaptive icon is a 108×108 dp canvas of which only the central 66×66 dp is
 * guaranteed visible under EVERY launcher mask (circle, squircle, rounded square, teardrop).
 * 66/108 = 0.6111. Exceeding this is the single most common adaptive-icon defect and is precisely
 * what SC-004 exists to catch. The test suite asserts it.
 */
export const ANDROID_SAFE_OCCUPANCY = 66 / 108

// The composition decides WHETHER a target has an opaque ground and what the alpha policy is; with
// `groundFromColourway` the COLOURWAY decides which ground it is. `radius` rounds the ground's
// corners (a share of the side) — only where the platform shows the file as-is. Anything a platform
// masks itself (iOS, the maskable icon, the adaptive layers) is a full-bleed square.
export const COMPOSITIONS = {
  // ── Web ────────────────────────────────────────────────────────────────────────────────────────
  // The tab icon: a rounded tile on a transparent corner. A little fuller than the others, because
  // at 16px every pixel of padding is a pixel of lost letter.
  favicon: { occupancy: 0.52, background: GROUND.tile, groundFromColourway: true, radius: TILE_RADIUS, alpha: "preserve" },
  "web-icon": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, radius: TILE_RADIUS, alpha: "preserve" },
  // PWA maskable: the guaranteed-safe region is a circle of 80% diameter, and the launcher crops
  // the rest — so no rounded corner, and a slightly smaller mark.
  maskable: { occupancy: 0.42, background: GROUND.tile, groundFromColourway: true, alpha: "preserve" },
  "apple-touch": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, alpha: "strip" },

  // ── iOS ────────────────────────────────────────────────────────────────────────────────────────
  // ⚠ RULE P2 — every ios-* profile bakes an OPAQUE ground and strips alpha. App Store Connect
  // rejects an icon that CONTAINS an alpha channel, even a fully opaque one (024 research R3).
  // The tile is already dark, so the light and dark appearances are the same icon.
  "ios-app": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, alpha: "strip" },
  "ios-dark": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, alpha: "strip" },
  // Tinted: iOS derives a tint from luminance, so the source is a mono mark on black.
  "ios-tinted": { occupancy: TILE_OCCUPANCY, background: GROUND.black, alpha: "strip" },

  // ── Android ────────────────────────────────────────────────────────────────────────────────────
  // Foreground and monochrome are separate LAYERS — their ground comes from the background layer,
  // so they must keep alpha (rule P3). The launcher shows roughly the middle two-thirds of the
  // 108dp canvas, so 0.34 of the canvas reads as about half the visible tile.
  "android-fg": { occupancy: 0.34, background: null, alpha: "preserve" },
  "android-mono": { occupancy: 0.34, background: null, alpha: "preserve" },
  // Legacy raster mipmaps for API 24–25 only, which predate adaptive icons and are not masked.
  "android-legacy": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, radius: TILE_RADIUS, alpha: "preserve" },
  // The notification badge: Android keeps only the silhouette, so it is the mark alone, drawn large.
  badge: { occupancy: 0.9, background: null, alpha: "preserve" },

  // ── Splash ─────────────────────────────────────────────────────────────────────────────────────
  // The Android 12+ splash icon without an icon background is a 288 dp canvas with a 192 dp visible
  // circle. Ground comes from the theme, so the drawable stays transparent.
  splash: { occupancy: 0.45, background: null, alpha: "preserve" },
}

/** Derive padding (as a fraction of the max content dimension) from a declared occupancy. */
export function paddingFor(occupancy) {
  return (1 / occupancy - 1) / 2
}

export function composition(name) {
  const c = COMPOSITIONS[name]
  if (!c) throw new Error(`unknown composition: ${name}`)
  return c
}
