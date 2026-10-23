// Compositions: geometry and ground only. Declared by occupancy, which is what platform rules
// constrain; padding is derived:
//
//  side = maxContentDimension × (1 + 2p)
//  occupancy = maxContentDimension / side = 1 / (1 + 2p)
//  ⇒ p = (1/occupancy − 1) / 2
//
// The mark is landscape (about 4:3), so width is the binding dimension.

/** Ground colours. */
export const GROUND = {
  tile: "#09090b",
  black: "#000000", // iOS tinted source wants maximum luminance range
}

/** How much of a tile the mark fills and how round the corners are: the favicon's numbers (31 of 64 units, 14-unit corner). */
export const TILE_OCCUPANCY = 0.48
export const TILE_RADIUS = 0.22

/**
 * The splash ground per mobile app: one colour, no light/dark pair. The Android `values/` and
 * `values-night/` `splash_background` colours are hand-maintained and must equal it. Not a design token.
 */
export const SPLASH_GROUND = {
  // The tile's own ground, so the launcher icon opens into the splash without a colour change.
  "customer-mobile": "#09090b",
  "driver-mobile": "#09090b",
}

export function splashGroundFor(app) {
  const g = SPLASH_GROUND[app]
  if (!g) throw new Error(`no splash ground declared for app '${app}'`)
  return g
}

/** Android's adaptive icon is 108×108 dp with only the central 66×66 dp visible under every mask: 66/108. */
export const ANDROID_SAFE_OCCUPANCY = 66 / 108

// The composition decides whether there is an opaque ground and the alpha policy; with
// `groundFromColourway` the colourway decides which ground. `radius` rounds corners only where the
// platform shows the file as-is; anything the platform masks is a full-bleed square.
export const COMPOSITIONS = {
  // Web
  // The tab icon: a rounded tile, a little fuller because at 16px padding is lost letter.
  favicon: { occupancy: 0.52, background: GROUND.tile, groundFromColourway: true, radius: TILE_RADIUS, alpha: "preserve" },
  "web-icon": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, radius: TILE_RADIUS, alpha: "preserve" },
  // PWA maskable: the safe region is an 80% circle, so no corner and a smaller mark.
  maskable: { occupancy: 0.42, background: GROUND.tile, groundFromColourway: true, alpha: "preserve" },
  "apple-touch": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, alpha: "strip" },

  // iOS
  // every ios-* profile bakes an opaque ground and strips alpha: App Store Connect rejects any alpha channel.
  "ios-app": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, alpha: "strip" },
  "ios-dark": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, alpha: "strip" },
  // Tinted: iOS derives a tint from luminance, so the source is a mono mark on black.
  "ios-tinted": { occupancy: TILE_OCCUPANCY, background: GROUND.black, alpha: "strip" },

  // Android
  // Foreground and monochrome are layers over the background layer, so they keep alpha. 0.34 of the
  // 108dp canvas reads as about half the visible tile.
  "android-fg": { occupancy: 0.34, background: null, alpha: "preserve" },
  "android-mono": { occupancy: 0.34, background: null, alpha: "preserve" },
  // Raster mipmaps for API 24–25, which predate adaptive icons.
  "android-legacy": { occupancy: TILE_OCCUPANCY, background: GROUND.tile, groundFromColourway: true, radius: TILE_RADIUS, alpha: "preserve" },
  // The notification badge: Android keeps only the silhouette.
  badge: { occupancy: 0.9, background: null, alpha: "preserve" },

  // Splash
  // The Android 12+ splash icon is a 288 dp canvas with a 192 dp visible circle; its ground comes from the theme.
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
