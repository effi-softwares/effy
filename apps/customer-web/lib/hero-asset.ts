import { existsSync } from "node:fs"
import { join } from "node:path"

/**
 * The operator-supplied hero photographs, or an empty list when none have been supplied (039 FR-011).
 *
 * ⚠ RESOLVED ONCE IN PRODUCTION, FRESHLY IN DEVELOPMENT — and the split is a bug fix, not a
 * micro-optimisation.
 *
 * The first version was a module-scope `const`. On a prerendered page that resolves at build time,
 * which is right for production: zero per-request filesystem work, and the hero stays in the static
 * shell where FR-012/FR-040 require it. **But a long-running dev server evaluates the module once too**
 * — so an operator who dropped the artwork into `public/hero/` while `next dev` was running kept
 * seeing the neutral placeholder, with the file sitting on disk and serving fine over HTTP. Nothing was
 * broken except the cached `null`, and the failure looked exactly like a bug in the hero.
 *
 * That is the worst shape a fallback can have: a supported empty state that is indistinguishable from a
 * defect. So development re-checks on every render (a stat call on a dev server is free) and production
 * keeps the build-time constant.
 *
 * ⚠ `existsSync` is correct here and a smell almost anywhere else — in production it runs exactly once,
 * during the build, in Node. It is not on any request path.
 *
 * ── ⚠ WebP, and why the source PNGs are not what ships ─────────────────────────────────────────
 *
 * The six artworks arrived as PNGs of ~2 MB each — **11.1 MB** in total, in a directory that is served
 * verbatim to the public. Re-encoded at quality 72 they are **334 KB for all six**, which is what the
 * single JPEG hero cost on its own (311 KB). Checked for banding in the flat colour zones, where lossy
 * compression shows up behind the type: none visible against the PNG at 1:1.
 *
 * WebP rather than AVIF: AVIF is another ~30% smaller (233 KB) but needs a `<picture>` fallback for
 * the browsers that lack it, and WebP already lands at parity with today's cost. Regenerate with
 * `sharp(src).webp({ quality: 72, effort: 6 })`.
 */
const HERO_FILENAMES = [
  "hero-1.webp",
  "hero-2.webp",
  "hero-3.webp",
  "hero-4.webp",
  "hero-5.webp",
  "hero-6.webp",
] as const

/**
 * ⚠ THE ROTATION'S KEYFRAMES HARDCODE A SIXTH OF THE CYCLE (`.fx-hero` in `app/globals.css`), and CSS
 * cannot derive a keyframe percentage from a custom property. Adding or removing an artwork here must
 * change those percentages too — so this is a compile-time guard rather than a comment nobody reads.
 * `Hero` additionally refuses to animate unless it resolves exactly this many files, because a
 * half-supplied set would rotate with gaps and dead frames rather than fail.
 */
const _fileCountMatchesKeyframes: 6 = HERO_FILENAMES.length

/** Resolved once at module load — i.e. at BUILD time for the prerendered home page. */
const RESOLVED_AT_BUILD = resolveHeroImages()

/**
 * Public URLs of the hero artwork, in rotation order. Empty when none are present.
 *
 * A function rather than a constant so development can re-check; callers should treat it as a value
 * and call it at render time.
 */
export function heroImageUrls(): readonly string[] {
  return process.env.NODE_ENV === "development" ? resolveHeroImages() : RESOLVED_AT_BUILD
}

function resolveHeroImages(): readonly string[] {
  try {
    const dir = join(process.cwd(), "public", "hero")
    return HERO_FILENAMES.filter((name) => existsSync(join(dir, name))).map((name) => `/hero/${name}`)
  } catch {
    // ⚠ Absence is a SUPPORTED state, so a failure to determine it degrades to absence rather than
    // throwing. A hero that cannot be resolved must render the placeholder, never break the page —
    // this is the single most visible component on the platform's only public surface.
    return []
  }
}

/** How many artworks the rotation needs before it will animate. */
export const HERO_ROTATION_COUNT = HERO_FILENAMES.length
