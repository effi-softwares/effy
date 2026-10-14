/**
 * A shopper picture's smaller copies, and where each one lives (086-catalogue-image-delivery).
 *
 * The server sends a picture's permanent address (`imageUrl`) and the widths of the copies that exist
 * (`imageWidths`); a client derives each copy's address with `renditionUrl`. ⚠ This is the ONE naming
 * rule: the worker that writes the copies (`apis/edge-api/media`, `renditionKey`) and any Kotlin twin
 * are held to it by `media.fixtures.json`. A second rule that disagreed would not show anything wrong
 * — it would name files that do not exist, and the browser shows a broken picture for those.
 */

/** The standard steps a copy is made at, when the original is wider (086 research R5). */
export const RENDITION_WIDTHS = [160, 320, 640, 1280] as const

/** No copy is wider than this. A narrower original also gets a copy at its own width (FR-013). */
export const MAX_RENDITION_WIDTH = 1280

/**
 * The address of one copy: `<origin>/renditions/<key without extension>/w<width>.webp`.
 *
 *     renditionUrl("https://media.dev.effyshopping.com/products/o1/t1.jpg", 320)
 *       = "https://media.dev.effyshopping.com/renditions/products/o1/t1/w320.webp"
 */
export function renditionUrl(imageUrl: string, width: number): string {
  if (!Number.isInteger(width) || width < 1 || width > MAX_RENDITION_WIDTH) {
    throw new RangeError(`renditionUrl: width must be an integer from 1 to ${MAX_RENDITION_WIDTH}, got ${width}`)
  }
  const url = new URL(imageUrl)
  const key = url.pathname.replace(/^\/+/, "")
  const stem = key.replace(/\.[^./]+$/, "")
  return `${url.origin}/renditions/${stem}/w${width}.webp`
}

/** A `srcset` value over the copies given: `"<url> 160w, <url> 320w"`. Empty for none. */
export function srcSet(imageUrl: string, widths: readonly number[]): string {
  return widths.map((w) => `${renditionUrl(imageUrl, w)} ${w}w`).join(", ")
}
