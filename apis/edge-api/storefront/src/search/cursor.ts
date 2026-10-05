/** Keyset cursors for product search (025 FR-016b). */
import type { ProductSort } from "@effy/shared-types";

export const SORT_NEWEST: ProductSort = "newest";
const SORTS: readonly ProductSort[] = ["newest", "price_asc", "price_desc", "relevance"];

/**
 * Map the wire value to a sort, defaulting to newest. `null` means the caller sent a value that is
 * not a sort at all — the handler 400s rather than silently reordering their results.
 */
export function parseSort(raw: string | null | undefined): ProductSort | null {
  const s = (raw ?? "").trim();
  if (s === "") return SORT_NEWEST;
  return (SORTS as readonly string[]).includes(s) ? (s as ProductSort) : null;
}

/**
 * An opaque, SORT-TAGGED keyset position.
 *
 * ⚠ The `sort` field is the point of this type, not decoration. Each ordering has its own keyset
 * tuple — a timestamp for newest, a decimal for price, a similarity score for relevance. Feed a
 * cursor minted under one ordering into a query using another and the database happily compares a
 * price against a timestamp: no error, just products silently dropped and others repeated. So the
 * cursor carries the ordering it was issued under, and a request whose sort disagrees is REJECTED.
 */
export interface Cursor {
  sort: ProductSort;
  /** The sort column's value at the cursor position, as text — money never passes through a float. */
  key: string;
  /** The uuid tiebreak. MANDATORY: no sort key is unique, and a keyset without one skips rows. */
  id: string;
}

/**
 * Prefixes the payload so the format can change without silently misreading old cursors. A cursor
 * is an ephemeral page position, not persisted state: rejecting a stale one costs a restart.
 */
const CURSOR_VERSION = "2";
const SEP = "|";

/** Render the cursor as an opaque base64url token. Clients MUST NOT construct one. */
export function encodeCursor(c: Cursor): string {
  return Buffer.from([CURSOR_VERSION, c.sort, c.key, c.id].join(SEP), "utf8").toString("base64url");
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Parse a token. `null` covers every malformed case — bad base64, wrong version, wrong field
 * count, an unknown sort, an empty key or id.
 */
export function decodeCursor(token: string): Cursor | null {
  if (!BASE64URL.test(token)) return null;
  const parts = Buffer.from(token, "base64url").toString("utf8").split(SEP);
  if (parts.length !== 4 || parts[0] !== CURSOR_VERSION) return null;
  const [, rawSort, key, id] = parts as [string, string, string, string];
  const sort = rawSort === "" ? null : parseSort(rawSort);
  if (!sort || key === "" || id === "") return null;
  return { sort, key, id };
}
