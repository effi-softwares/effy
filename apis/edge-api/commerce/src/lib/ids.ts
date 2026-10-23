const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checked before the database: a non-uuid sent at a uuid column raises and reads as a server fault. */
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID.test(s);
}
