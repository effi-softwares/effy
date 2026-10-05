const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a caller-supplied id is a uuid at all. Checked BEFORE the database is asked: an id that
 * is not one sent at a uuid column raises, and a mistyped or stale link would be reported as the
 * platform failing rather than as "no such thing".
 */
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID.test(s);
}
