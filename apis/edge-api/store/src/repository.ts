// Repository layer: raw parameterized SQL + explicit row → domain mapping, nothing
// else. The proving read consumes platform-owned data only — the goose migration
// ledger (003) and catalog functions — introducing zero product schema (research E2).
import { query } from "./lib/db";
import type { PlatformStatus } from "./types";

const qStatus = `
SELECT current_database()                                    AS database_name,
       now()                                                 AS database_time,
       COALESCE((SELECT MAX(version_id)
                   FROM goose_db_version
                  WHERE is_applied), 0)                      AS migration_version,
       (SELECT COUNT(*)
          FROM goose_db_version
         WHERE is_applied AND version_id > 0)                AS migrations_applied
`;

// Wire shape of qStatus — BIGINTs arrive as strings from the driver; mapped
// explicitly below and never exported.
interface StatusRow {
  database_name: string;
  database_time: Date;
  migration_version: string | number;
  migrations_applied: string | number;
}

export interface StatusRepository {
  status(): Promise<Omit<PlatformStatus, "environment">>;
}

export const statusRepository: StatusRepository = {
  async status() {
    const result = await query<StatusRow>(qStatus);
    const row = result.rows[0];
    if (!row) throw new Error("platformstatus: status query returned no row");

    return {
      databaseName: row.database_name,
      databaseTime: row.database_time,
      // Ledger version ids are 14-digit timestamps — safely inside Number range.
      migrationVersion: Number(row.migration_version),
      migrationsApplied: Number(row.migrations_applied),
    };
  },
};

// pingDatabase is the health check's dependency probe (2s budget enforced by the
// caller; SELECT 1 keeps it free of any table dependency).
export async function pingDatabase(): Promise<void> {
  await query("SELECT 1");
}
