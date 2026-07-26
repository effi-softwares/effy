// COMPOSITIONS — geometry and ground only. No colourway knowledge (024 data-model §3).
//
// A composition says HOW the mark sits inside a square frame: how much of the frame it occupies,
// what (if anything) is behind it, and whether the result keeps its alpha channel.
//
// Compositions are declared by OCCUPANCY, not by padding, because occupancy is the thing platform
// rules actually constrain (Android's safe zone, Apple's corner radius). Padding is derived:
//
//     side       = maxContentDimension × (1 + 2p)
//     occupancy  = maxContentDimension / side = 1 / (1 + 2p)
//     ⇒  p       = (1/occupancy − 1) / 2
//
// The mark is PORTRAIT (244.0 × 343.3, aspect 0.711), so height is always the binding dimension and
// occupancy is measured against it. That is the conservative choice.

/** Ground colours. Light/dark follow the design system's surfaces; they are not brand accents. */
export const GROUND = {
  light: "#ffffff",
  dark: "#171717", // neutral-900 — the design system's dark ground
  black: "#000000", // iOS tinted source wants maximum luminance range
}

/**
 * ⚠ RULE P1 — Android's adaptive icon is a 108×108 dp canvas of which only the central 66×66 dp is
 * guaranteed visible under EVERY launcher mask (circle, squircle, rounded square, teardrop).
 * 66/108 = 0.6111. Exceeding this is the single most common adaptive-icon defect and is precisely
 * what SC-004 exists to catch. The test suite asserts it.
 */
export const ANDROID_SAFE_OCCUPANCY = 66 / 108

export const COMPOSITIONS = {
  // ── Web ────────────────────────────────────────────────────────────────────────────────────────
  // Tiny renders need maximum ink; at 16px every pixel of padding is a pixel of lost silhouette.
  favicon: { occupancy: 0.96, background: null, alpha: "preserve" },
  "web-icon": { occupancy: 0.89, background: null, alpha: "preserve" },
  // PWA maskable: the guaranteed-safe region is a circle of 80% diameter. A portrait mark inscribed
  // in that circle needs materially more room than 80% suggests.
  maskable: { occupancy: 0.62, background: GROUND.light, alpha: "preserve" },
  "apple-touch": { occupancy: 0.75, background: GROUND.light, alpha: "strip" },

  // ── iOS ────────────────────────────────────────────────────────────────────────────────────────
  // ⚠ RULE P2 — every ios-* profile bakes an OPAQUE ground and strips alpha. App Store Connect
  // rejects an icon that CONTAINS an alpha channel, even a fully opaque one (research R3).
  "ios-app": { occupancy: 0.68, background: GROUND.light, alpha: "strip" },
  "ios-dark": { occupancy: 0.68, background: GROUND.dark, alpha: "strip" },
  // Tinted: iOS derives a tint from luminance, so the source is a mono mark on black.
  "ios-tinted": { occupancy: 0.68, background: GROUND.black, alpha: "strip" },

  // ── Android ────────────────────────────────────────────────────────────────────────────────────
  // Foreground and monochrome are separate LAYERS — their ground comes from the background layer,
  // so they must keep alpha (rule P3). Both are pinned inside the safe zone.
  "android-fg": { occupancy: 0.595, background: null, alpha: "preserve" },
  "android-mono": { occupancy: 0.595, background: null, alpha: "preserve" },
  // Legacy raster mipmaps for API 24–25 only, which predate adaptive icons and are not masked.
  "android-legacy": { occupancy: 0.8, background: GROUND.light, alpha: "preserve" },

  // ── Splash ─────────────────────────────────────────────────────────────────────────────────────
  // The Android 12+ splash icon without an icon background is a 288 dp canvas with a 192 dp visible
  // region (192/288 = 0.667). Ground comes from the theme, so the drawable stays transparent.
  splash: { occupancy: 0.667, background: null, alpha: "preserve" },
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
