// Which copies a picture gets, and where each one is kept (086 research R5).
import { MAX_RENDITION_WIDTH, RENDITION_WIDTHS } from "@effy/shared-types";
import { RENDITION_PREFIX } from "@effy/edge-shared";

/**
 * The widths to make for an original `sourceWidth` pixels wide: the standard steps strictly below it,
 * plus the source width itself when it is no wider than the largest step (FR-013). So a large view of
 * a mid-size picture is the picture at full resolution, never an enlarged smaller copy — and nothing
 * is ever enlarged.
 *
 *     3000 → 160 320 640 1280      1000 → 160 320 640 1000      120 → 120
 */
export function widthsFor(sourceWidth: number): number[] {
  if (!Number.isInteger(sourceWidth) || sourceWidth < 1) return [];
  const widths: number[] = RENDITION_WIDTHS.filter((w) => w < sourceWidth);
  if (sourceWidth <= MAX_RENDITION_WIDTH) widths.push(sourceWidth);
  return widths;
}

/**
 * Where a copy is kept: `renditions/<original key without extension>/w<width>.webp`.
 *
 * ⚠ Must name exactly what `renditionUrl` (@effy/shared-types) names — clients derive a copy's address
 * from the original's, and a copy written anywhere else is a broken picture. `widths.test.ts` runs the
 * shared fixtures through both.
 */
export function renditionKey(storageKey: string, width: number): string {
  const stem = storageKey.replace(/\.[^./]+$/, "");
  return `${RENDITION_PREFIX}/${stem}/w${width}.webp`;
}

/** The original prefixes the worker accepts — the bucket notifies only these. */
export const ORIGINAL_PREFIXES = ["products/", "promotions/"] as const;

export function isOriginalKey(key: string): boolean {
  return ORIGINAL_PREFIXES.some((p) => key.startsWith(p)) && !key.includes("..") && !key.includes("//");
}
