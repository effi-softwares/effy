// The PUBLIC address of a shopper's picture (086-catalogue-image-delivery).
//
// A catalogue or promotion picture is served by the CDN at `<MEDIA_PUBLIC_BASE_URL>/<storage key>` —
// one address, the same on every request, kept by the browser for a year. The bucket stays private:
// the CDN may read ONLY the prefixes below (infra/envs/<env>/media.tf, `local.public_media_prefixes`).
//
// ⚠ THE SAME BUCKET HOLDS COURIER LABELS AND DELIVERY PROOF. A label carries a customer's name and
// address; a proof photo shows their door. Neither may ever have a public address, which is why this
// is the ONLY function that builds one, and why it answers null for any key outside the set rather
// than trusting its caller. Those objects are read through `presignRead` (media.ts) and nothing else.
//
// ⚠ The list is stated twice — here and in Terraform — and `media-public.guard.test.ts` reads
// media.tf to prove the two agree. A prefix added on one side only either serves nothing (here
// only) or makes objects fetchable that no code means to publish (Terraform only).
import { logger } from "./logger";

export const PUBLIC_MEDIA_PREFIXES = ["products", "promotions", "renditions"] as const;

/** Where the worker writes the smaller copies (086 research R5). Public; never notified. */
export const RENDITION_PREFIX = "renditions";

const PUBLIC = new Set<string>(PUBLIC_MEDIA_PREFIXES);

function baseUrl(): string {
  const base = process.env.MEDIA_PUBLIC_BASE_URL;
  if (!base) throw new Error("MEDIA_PUBLIC_BASE_URL is not configured");
  return base.replace(/\/+$/, "");
}

/**
 * The permanent public address of a stored picture, or null.
 *
 * Null for no key, for a key outside the public set (a label, a proof photo, anything added later),
 * and for a key that is not a plain relative path. Never throws for a key — a missing picture must
 * never fail the read around it — but does throw when the base URL is not configured: a deployment
 * that forgot it must stop, not quietly show no pictures.
 *
 * Pure: no network call and no signing.
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
    // The prefix only — a key names a parcel or an order.
    logger.warn({ prefix }, "media: refused a public address outside the public set");
    return null;
  }
  return `${base}/${segments.map(encodeURIComponent).join("/")}`;
}

/**
 * SQL: the widths of a picture's READY copies, as a correlated subquery on its storage key (086).
 * NULL when none are ready — the client then shows the original, and never names a copy that is not
 * there (a `<source>` naming a missing file shows a broken picture; it does not fall back).
 * ⚠ The one way a reader asks `public.media_rendition`; its one writer is `apis/edge-api/media`.
 */
export function renditionWidthsSql(keyExpr: string): string {
  return `(SELECT mr.widths FROM public.media_rendition mr WHERE mr.storage_key = ${keyExpr} AND mr.status = 'ready')`;
}

/** A row's copy widths on the wire: ascending, [] for none. */
export function widthsOf(widths: readonly number[] | null | undefined): number[] {
  return widths ? [...widths].sort((a, b) => a - b) : [];
}

/**
 * The `imageWidths` field for a DTO: present only when there are copies (086). Absent and [] mean the
 * same to a client, and leaving it off keeps a picture with no copies byte-identical on the wire to
 * before — the mobile app's strict wire fixtures compare whole payloads.
 */
export function imageWidthsField(widths: readonly number[] | null | undefined): { imageWidths?: number[] } {
  const sorted = widthsOf(widths);
  return sorted.length > 0 ? { imageWidths: sorted } : {};
}

/** `publicImageUrl` in the async shape the services' image seams take (they are faked in tests). */
export async function publicImageAddress(storageKey: string | null | undefined): Promise<string | null> {
  return publicImageUrl(storageKey);
}
