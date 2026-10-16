// COLOURWAYS — colour only. No geometry lives here.
//
// ⚠ These values are ASSET-LOCAL. They MUST NOT be imported from, or exported into,
// @effy/design-system — this package deliberately does not depend on it. They happen to equal the
// storefront's `--foreground` and `--brand`, because the mark is the storefront wordmark's first
// letter and its full stop; they are restated here, not read from there.
//
// ── ONE IDENTITY ON EVERY SURFACE ─────────────────────────────────────────────────────────────────
//
// The mark is "e." — the Effy wordmark's first letter and its green full stop. Until this mark the
// brand was a shopping bag, drawn in three colourways so the customer, shop and back-office icons
// could be told apart. On operator direction every surface now carries the SAME icon: a near-black
// tile, a white letter, a green square. There is one colourway.

/** The two slot values as they appear in the authored master (the light logo's colours). */
export const SLOTS = {
  letter: "#09090b", // the "e"
  dot: "#0d7a40", // the full stop — the brand green, the same in every appearance
}

/** A colourway is the two mark slots PLUS the ground the mark sits on. */
export const COLOURWAYS = {
  // White letter, green full stop, near-black tile — every icon on every surface.
  tile: {
    name: "Tile",
    ground: "#09090b",
    letter: "#ffffff",
    dot: "#0d7a40",
  },
  // 092 — the driver app: the same tile and letter, the full stop in Effy blue (the storefront's
  // --primary, #1d4ed8). Drawn from src/logo-driver.svg, where the full stop is a small steering wheel.
  driver: {
    name: "Driver",
    ground: "#09090b",
    letter: "#ffffff",
    dot: "#1d4ed8",
  },
}

/** The wordmark's two appearances. The full stop is green in both; only the word changes. */
export const WORDMARK = {
  light: { word: "#09090b", dot: "#0d7a40" },
  dark: { word: "#ffffff", dot: "#0d7a40" },
}

/**
 * MONO is a DERIVATION, not a colourway: the whole mark in one colour. The Android themed-icon
 * layer, the iOS tinted appearance and the notification badge all need it — each is re-tinted or
 * reduced to a silhouette by the platform, so the green cannot survive there anyway.
 *
 * It carries NO ground: mono targets are layers, and their ground comes from the composition.
 */
export function mono(colour) {
  return { name: `Mono(${colour})`, letter: colour, dot: colour }
}

/**
 * The retired values. Named here ONLY so the test suite can prove they never appear (rule C3), which
 * is also why scripts/check-no-emerald.sh excludes this one file.
 */
export const RETIRED_JADE = ["#0fb57e", "#047857"]
export const RETIRED_EMERALD = [
  "#065f46", // emerald-800 — the accent
  "#10b981", // emerald-500 — the dark ring + the old mark body
  "#d0735a", // terracotta as supplied
  "#bf5540", // terracotta AA-tuned for light
  "#dd8368", // terracotta lifted for dark
  "#69b08b", // the emerald tint on dark surfaces
  "#0ea5e9", // sky-500 — the old shop mark body
  "#075985", // sky-800 — the old shop mark fold
  "#4ade80", // green-400 — the old customer splash ground
  "#3b82f6", // blue-500 — the old shop splash ground
  "#0c1d36", // the navy outline the monochrome mark replaced
]

/**
 * Apply a colourway to the authored master by exact string substitution.
 *
 * Deliberately the dumbest possible mechanism: anything cleverer could silently mis-recolour a shade
 * and nobody would notice until an icon shipped. The placeholder pass makes it order-independent, so
 * no substitution can consume another's output.
 */
export function applyColourway(svg, cw) {
  return substitute(svg, [
    [SLOTS.letter, cw.letter],
    [SLOTS.dot, cw.dot],
  ])
}

/** Recolour the wordmark master (authored in its light appearance) for one appearance. */
export function applyWordmark(svg, appearance) {
  return substitute(svg, [
    [WORDMARK.light.word, appearance.word],
    [WORDMARK.light.dot, appearance.dot],
  ])
}

function substitute(svg, pairs) {
  let out = svg
  pairs.forEach(([from], i) => {
    out = out.replaceAll(from, ` SLOT${i} `)
  })
  pairs.forEach(([, to], i) => {
    out = out.replaceAll(` SLOT${i} `, to)
  })
  return out
}
