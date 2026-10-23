// The public address of a shopper picture: `<MEDIA_PUBLIC_BASE_URL>/<storage key>`, the same on every
// request and cached for a year. The bucket is private and the CDN reads only these prefixes
// (`local.public_media_prefixes` in media.tf; `media-public.guard.test.ts` holds the two together). The
// same bucket holds courier labels and delivery proof, which must never get a public address: this is
// the only builder, and it refuses any key outside the set. Those are read through `presignRead`.
import { logger } from "./logger";

export const PUBLIC_MEDIA_PREFIXES = ["products", "promotions", "renditions"] as const;

/** Where the worker writes smaller copies. Public; never notified. */
export const RENDITION_PREFIX = "renditions";

const PUBLIC = new Set<string>(PUBLIC_MEDIA_PREFIXES);

function baseUrl(): string {
  const base = process.env.MEDIA_PUBLIC_BASE_URL;
  if (!base) throw new Error("MEDIA_PUBLIC_BASE_URL is not configured");
  return base.replace(/\/+$/, "");
}

/**
 * null for no key, a key outside the public set, or a key that is not a plain relative path. Never
 * throws for a key, but throws when the base URL is not configured. Pure: no network, no signing.
 */
export function publicImageUrl(storageKey: string | null | undefined): string | null {
  const base = baseUrl();
  if (!storageKey) return null;
  // eslint-disable-next-line no-control-regex
  if (storageKey.startsWith("/") || storageKey.includes("//") || /[\u0000-\u001f\u007f]/.test(storageKey)) return null;
  const segments = storageKey.split("/");
  if (segments.some((s) => s === ".." || s === ".")) return null;
  const prefix = segments[0] ?? "";
  if (!PUBLIC.has(prefix) || segments.length < 2) {
    // The prefix only: a key names a parcel or an order.
    logger.warn({ prefix }, "media: refused a public address outside the public set");
    return null;
  }
  return `${base}/${segments.map(encodeURIComponent).join("/")}`;
}

/**
 * SQL: the widths of a picture's ready copies (subquery on its storage key); null when none, so a client
 * never names a missing copy. The one reader of `public.media_rendition`; its writer is the media worker.
 */
export function renditionWidthsSql(keyExpr: string): string {
  return `(SELECT mr.widths FROM public.media_rendition mr WHERE mr.storage_key = ${keyExpr} AND mr.status = 'ready')`;
}

/** Ascending; [] for none. */
export function widthsOf(widths: readonly number[] | null | undefined): number[] {
  return widths ? [...widths].sort((a, b) => a - b) : [];
}

/** Present only when there are copies, keeping a picture without copies byte-identical on the wire. */
export function imageWidthsField(widths: readonly number[] | null | undefined): { imageWidths?: number[] } {
  const sorted = widthsOf(widths);
  return sorted.length > 0 ? { imageWidths: sorted } : {};
}

/** In the async shape the services' image seams take. */
export async function publicImageAddress(storageKey: string | null | undefined): Promise<string | null> {
  return publicImageUrl(storageKey);
}
