// Reads an activity source (104) against a test database, newest first, as the drawer shows it. Container tests
// mock `query` on the package's root, which the activity helper's own import of the pool does not see.
import type { ActivityEntryDTO } from "@effy/shared-types";

import { toActivityEntry, type ActivityRow, type ActivitySource } from "../lib/activity";

export async function activityEntries(
  db: {
    query: (text: string, values?: never[]) => Promise<{ rows: unknown[] }>;
  },
  source: ActivitySource,
): Promise<ActivityEntryDTO[]> {
  const res = await db.query(`SELECT * FROM (${source.sql}) e ORDER BY e.at DESC, e.id DESC`, source.args as never[]);
  const rows = res.rows as ActivityRow[];
  return rows.map((r) => toActivityEntry(source, r));
}
