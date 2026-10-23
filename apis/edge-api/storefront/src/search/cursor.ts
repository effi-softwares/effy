import type { ProductSort } from "@effy/shared-types";

export const SORT_NEWEST: ProductSort = "newest";
const SORTS: readonly ProductSort[] = ["newest", "price_asc", "price_desc", "relevance"];

/** Defaults to newest; `null` means not a sort at all, which the handler refuses. */
export function parseSort(raw: string | null | undefined): ProductSort | null {
  const s = (raw ?? "").trim();
  if (s === "") return SORT_NEWEST;
  return (SORTS as readonly string[]).includes(s) ? (s as ProductSort) : null;
}

/**
 * Carries the ordering it was issued under: each sort has its own keyset tuple, and mixing them
 * silently drops and repeats rows. A mismatched sort is rejected.
 */
export interface Cursor {
  sort: ProductSort;
  /** As text, so money never passes through a float. */
  key: string;
  /** The uuid tiebreak: no sort key is unique. */
  id: string;
}

/** Version prefix; a stale cursor is rejected and paging restarts. */
const CURSOR_VERSION = "2";
const SEP = "|";

/** Clients must not construct one. */
export function encodeCursor(c: Cursor): string {
  return Buffer.from([CURSOR_VERSION, c.sort, c.key, c.id].join(SEP), "utf8").toString("base64url");
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** `null` for every malformed case. */
export function decodeCursor(token: string): Cursor | null {
  if (!BASE64URL.test(token)) return null;
  const parts = Buffer.from(token, "base64url").toString("utf8").split(SEP);
  if (parts.length !== 4 || parts[0] !== CURSOR_VERSION) return null;
  const [, rawSort, key, id] = parts as [string, string, string, string];
  const sort = rawSort === "" ? null : parseSort(rawSort);
  if (!sort || key === "" || id === "") return null;
  return { sort, key, id };
}
