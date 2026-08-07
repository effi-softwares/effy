import { existsSync } from "node:fs"
import { join } from "node:path"

/**
 * The operator-supplied hero photograph, or `null` when it has not been supplied yet (039 FR-011).
 *
 * ⚠ RESOLVED ONCE IN PRODUCTION, FRESHLY IN DEVELOPMENT — and the split is a bug fix, not a
 * micro-optimisation.
 *
 * The first version was a module-scope `const`. On a prerendered page that resolves at build time,
 * which is right for production: zero per-request filesystem work, and the hero stays in the static
 * shell where FR-012/FR-040 require it. **But a long-running dev server evaluates the module once too**
 * — so an operator who dropped `hero-1.jpg` into `public/hero/` while `next dev` was running kept
 * seeing the neutral placeholder, with the file sitting on disk and serving fine over HTTP. Nothing was
 * broken except the cached `null`, and the failure looked exactly like a bug in the hero.
 *
 * That is the worst shape a fallback can have: a supported empty state that is indistinguishable from a
 * defect. So development re-checks on every render (a stat call on a dev server is free) and production
 * keeps the build-time constant.
 *
 * ⚠ `existsSync` is correct here and a smell almost anywhere else — in production it runs exactly once,
 * during the build, in Node. It is not on any request path.
 */
const HERO_FILENAME = "hero-1.jpg"

/** Resolved once at module load — i.e. at BUILD time for the prerendered home page. */
const RESOLVED_AT_BUILD = resolveHeroImage()

/**
 * Public URL of the hero image, or null when the asset is absent.
 *
 * A function rather than a constant so development can re-check; callers should treat it as a value
 * and call it at render time.
 */
export function heroImageUrl(): string | null {
  return process.env.NODE_ENV === "development" ? resolveHeroImage() : RESOLVED_AT_BUILD
}

function resolveHeroImage(): string | null {
  try {
    const path = join(process.cwd(), "public", "hero", HERO_FILENAME)
    return existsSync(path) ? `/hero/${HERO_FILENAME}` : null
  } catch {
    // ⚠ Absence is a SUPPORTED state, so a failure to determine it degrades to absence rather than
    // throwing. A hero that cannot be resolved must render the placeholder, never break the page —
    // this is the single most visible component on the platform's only public surface.
    return null
  }
}
