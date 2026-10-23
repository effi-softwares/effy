import { MAX_RENDITION_WIDTH, RENDITION_WIDTHS } from "@effy/shared-types";
import { RENDITION_PREFIX } from "@effy/edge-shared";

/**
 * The standard steps strictly below the source width, plus the source width when it is no wider than
 * the largest step. Nothing is enlarged.
 *
 *  3000 → 160 320 640 1280 1000 → 160 320 640 1000 120 → 120
 */
export function widthsFor(sourceWidth: number): number[] {
  if (!Number.isInteger(sourceWidth) || sourceWidth < 1) return [];
  const widths: number[] = RENDITION_WIDTHS.filter((w) => w < sourceWidth);
  if (sourceWidth <= MAX_RENDITION_WIDTH) widths.push(sourceWidth);
  return widths;
}

/** Must match `renditionUrl` in @effy/shared-types; `widths.test.ts` checks both against shared fixtures. */
export function renditionKey(storageKey: string, width: number): string {
  const stem = storageKey.replace(/\.[^./]+$/, "");
  return `${RENDITION_PREFIX}/${stem}/w${width}.webp`;
}

/** The bucket notifies only these. */
export const ORIGINAL_PREFIXES = ["products/", "promotions/"] as const;

export function isOriginalKey(key: string): boolean {
  return ORIGINAL_PREFIXES.some((p) => key.startsWith(p)) && !key.includes("..") && !key.includes("//");
}
