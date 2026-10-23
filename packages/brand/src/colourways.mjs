// Colourways: colour only. Asset-local: equal to the storefront's `--foreground` and `--brand` but
// never imported from @effy/design-system. The mark is "e.", the wordmark's first letter and its green
// full stop, on a near-black tile, the same on every surface.

/** The two slot values as they appear in the authored master (the light logo's colours). */
export const SLOTS = {
  letter: "#09090b", // the "e"
  dot: "#0d7a40",
}

/** A colourway is the two mark slots plus the ground the mark sits on. */
export const COLOURWAYS = {
  tile: {
    name: "Tile",
    ground: "#09090b",
    letter: "#ffffff",
    dot: "#0d7a40",
  },
  // The driver app: the same tile and letter, the full stop in Effy blue, drawn from src/logo-driver.svg (a steering wheel).
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
 * Mono is a derivation: the whole mark in one colour, for the Android themed layer, the iOS tinted
 * appearance and the notification badge. It carries no ground.
 */
export function mono(colour) {
  return { name: `Mono(${colour})`, letter: colour, dot: colour }
}

/** Retired values, named only so the tests can prove they never appear (check-no-emerald.sh excludes this file). */
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

/** Applies a colourway by exact string substitution through placeholders, so no substitution consumes another's output. */
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
