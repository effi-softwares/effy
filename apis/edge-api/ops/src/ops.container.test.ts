import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { staffRecords } from "./admin-bootstrap";
import { loadLocalities } from "./localities";

/**
 * 070 — the operator tools' SQL against the REAL schema. A wrong column in a tool run twice a year
 * is found the day it is needed, by the person who is locked out.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let db: pg.Client;

d("070 — operator tools against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    db = new pg.Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    await db.query(migrationSql());
  }, 180_000);

  afterAll(async () => {
    await db?.end();
    await container?.stop();
  });

  it("loads the reference file, and loading it again changes nothing", async () => {
    const csv = readFileSync(resolve(import.meta.dirname, "../../../../db/reference/au-localities.csv"), "utf8");
    await db.query(`DELETE FROM public.locality`);
    const first = await loadLocalities(db, csv);
    expect(first.read).toBeGreaterThan(10);
    expect(first.upserted).toBe(first.read);
    const count = async () => Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.locality`)).rows[0]!.n);
    expect(await count()).toBe(first.read);

    expect(await loadLocalities(db, csv)).toEqual(first);
    expect(await count()).toBe(first.read);
    expect((await db.query(`SELECT name, state, latitude::text FROM public.locality WHERE postcode = '3000'`)).rows[0])
      .toMatchObject({ name: "MELBOURNE", state: "VIC" });
  });

  it("a row the table refuses fails the load, naming the row", async () => {
    await expect(loadLocalities(db, "postcode,locality,state\n30,NOWHERE,VIC")).rejects.toThrow(/upsert row 1 \(NOWHERE VIC 30\)/);
  });

  it("the first admin is created once, refreshed on a re-run, and restored if disabled", async () => {
    const records = staffRecords(db);
    expect(await records.upsertSuperAdmin("sub-a", "jane@effy.test", "Jane")).toBe("created");
    await db.query(`UPDATE admin.staff SET status = 'disabled' WHERE cognito_sub = 'sub-a'`);
    expect(await records.upsertSuperAdmin("sub-a", "jane@effy.test", "Jane Doe")).toBe("updated");

    expect((await db.query(`SELECT name, status FROM admin.staff WHERE cognito_sub = 'sub-a'`)).rows).toEqual([{ name: "Jane Doe", status: "active" }]);
    expect((await db.query(`SELECT role_key FROM admin.staff_role sr JOIN admin.staff s ON s.id = sr.staff_id WHERE s.cognito_sub = 'sub-a'`)).rows)
      .toEqual([{ role_key: "admin" }]);
  });

  it("knows the last active admin, and deleting removes the record and its roles", async () => {
    const records = staffRecords(db);
    expect(await records.isLastActiveAdmin("sub-a")).toBe(true);
    await records.upsertSuperAdmin("sub-b", "sam@effy.test", "Sam");
    expect(await records.isLastActiveAdmin("sub-a")).toBe(false);
    // A disabled colleague does not count as another administrator.
    await db.query(`UPDATE admin.staff SET status = 'disabled' WHERE cognito_sub = 'sub-b'`);
    expect(await records.isLastActiveAdmin("sub-a")).toBe(true);
    expect(await records.isLastActiveAdmin("nobody")).toBe(false);

    expect(await records.deleteAdmin("sub-b", "sam@effy.test")).toBe("deleted");
    expect(await records.deleteAdmin("sub-b", "sam@effy.test")).toBe("not-found");
    expect(await records.deleteAdmin("", "jane@effy.test")).toBe("deleted"); // by email, when the identity is already gone
    expect((await db.query(`SELECT 1 FROM admin.staff_role`)).rowCount).toBe(0);
  });
});
