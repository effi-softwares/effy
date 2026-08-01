import canvas from "./banner-canvas.json";

/**
 * The canonical promotional banner canvas (029) â the platform's ONE definition.
 *
 * ââ â  WHY IT LIVES IN shared-types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
 *
 * It started in `design-system`, which was wrong in a way that only surfaced when the admin service
 * needed it: verifying stored artwork would have meant a **Lambda importing a UI package** for two
 * numbers. The canvas is not styling â it is a CONTRACT between the operator tool that produces
 * artwork, the service that verifies it, and the surfaces that render it. Which is exactly what this
 * package is for (Principle II).
 *
 * Consumers:
 *   Â· the back-office console (typed import)
 *   Â· `edge-api/admin` (server-side conformance check)
 *   Â· `customer-mobile`, via the Compose tokens `design-system` generates from this JSON
 *
 * â  NOTHING may hardcode these numbers. A `1200` written anywhere else is the drift this file exists
 * to prevent, already begun.
 */

export interface BannerTextZone {
  insetLeftPct: number;
  insetBottomPct: number;
  widthPct: number;
  heightPct: number;
}

export interface BannerCanvas {
  width: number;
  height: number;
  aspectRatio: number;
  /** Ceiling for the NORMALISED artwork; the raw upload is governed by the shared media limit. */
  maxBytes: number;
  /** Above this the banner is centred rather than grown â FR-015's "sensible maximum", as a number. */
  maxRenderWidthDp: number;
  /** Where the platform draws live copy. NOT a trim-safe region â nothing is ever trimmed. */
  textZone: BannerTextZone;
}

/**
 * Where an advertised promotion appears on Home (029 FR-027). **Exclusive** — never both.
 *
 * ⚠ Declared ONCE, here, and imported by both `storefront.ts` (the shopper-facing banner) and
 * `promotion.ts` (the operator-facing promotion). It was briefly declared in both, which typechecked
 * in each file alone and collided the moment the package re-exported them — the same union in two
 * places is precisely the drift Principle II exists to prevent.
 */
export type BannerPlacement = "carousel" | "inline";
export const BANNER_PLACEMENTS: readonly BannerPlacement[] = ["carousel", "inline"];

export const BANNER_CANVAS: BannerCanvas = canvas as BannerCanvas;

/** `"1200 Ã 600"` â for operator-facing copy, so no surface states the size by hand. */
export const bannerCanvasLabel = (): string => `${BANNER_CANVAS.width} × ${BANNER_CANVAS.height}`;

/** Exact-size check: what the server enforces and the console pre-checks. */
export function isCanonicalBannerSize(width: number, height: number): boolean {
  return width === BANNER_CANVAS.width && height === BANNER_CANVAS.height;
}

/**
 * Whether artwork is already at the canonical ASPECT RATIO, within a small tolerance.
 *
 * ⚠ The gate for scale-only normalisation. Artwork at 2:1 resamples to 1200 × 600 with its
 * composition intact; artwork at any other ratio cannot be fitted without **cropping**, and cropping
 * without the operator asking is what FR-008 forbids. Such artwork is refused, with the template
 * offered instead.
 *
 * The tolerance exists because a 1999 × 1000 export is 2:1 in every sense a person cares about.
 */
export function isCanonicalBannerRatio(width: number, height: number, tolerance = 0.01): boolean {
  if (width <= 0 || height <= 0) return false;
  return Math.abs(width / height - BANNER_CANVAS.aspectRatio) <= tolerance;
}
