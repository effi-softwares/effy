import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SignInAccount, SignInPort } from "@effy/edge-shared/team";

import { clientTransactor, createFirstAdmin, deleteAdmin, LastAdminError } from "./admin-bootstrap";
import { loadLocalities } from "./localities";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;

/** A pool in memory: username `u-<email>`, subject `sub-<email>`. */
function fakePort() {
  const accounts = new Map<string, SignInAccount>();
  const groups = new Map<string, SignInAccount["groups"]>();
  const port: SignInPort & { groups: typeof groups } = {
    groups,
    async create(email) {
      const existing = accounts.get(email);
      if (existing) return { ...existing, adopted: true };
      const made = { username: `u-${email}`, sub: `sub-${email}`, email, enabled: true, groups: [], createdAt: null };
      accounts.set(email, made);
      return { ...made, adopted: false };
    },
    async get(key) {
      return accounts.get(key) ?? [...accounts.values()].find((a) => a.username === key || a.sub === key) ?? null;
    },
    async enable() {},
    async disable() {},
    async delete(username) {
      for (const [k, a] of accounts) if (a.username === username || k === username) return accounts.delete(k);
      return false;
    },
    async setGroup(username, role) {
      groups.set(username, role ? [role] : []);
    },
    async globalSignOut() {},
    async listAll() {
      return [...accounts.values()];
    },
  };
  return port;
}
let db: pg.Client;

d("070 - operator tools against the real schema", () => {
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

  // One pool for the admin tests, as the real one is.
  const port = fakePort();

  it("119: the first admin is made through the team's writer, signed Operator; a re-run changes nothing", async () => {
    const transact = clientTransactor(db);
    expect(await createFirstAdmin(port, transact, "Jane@Effy.test", "Jane")).toMatchObject({ sub: "sub-jane@effy.test", cognito: "created", staff: "created" });
    expect(await createFirstAdmin(port, transact, "jane@effy.test", "Jane")).toMatchObject({ cognito: "already-exists", staff: "updated" });

    const rows = (await db.query(`SELECT s.email::text AS email, s.status, s.added_by_sub, sr.role_key
                                     FROM admin.staff s JOIN admin.staff_role sr ON sr.staff_id = s.id`)).rows;
    expect(rows).toEqual([{ email: "jane@effy.test", status: "active", added_by_sub: "operator", role_key: "admin" }]);
    const audit = (await db.query(`SELECT actor_sub, action FROM admin.audit_log WHERE action LIKE 'team.%' ORDER BY created_at`)).rows;
    expect(audit).toEqual([{ actor_sub: "operator", action: "team.added" }]);
    expect(port.groups.get("u-jane@effy.test")).toEqual(["admin"]);
  });

  it("119: delete refuses the last active admin unless forced, and keeps the record as Removed", async () => {
    const transact = clientTransactor(db);
    await expect(deleteAdmin(port, transact, "jane@effy.test", false)).rejects.toBeInstanceOf(LastAdminError);
    expect((await db.query(`SELECT status FROM admin.staff`)).rows).toEqual([{ status: "active" }]);

    await createFirstAdmin(port, transact, "sam@effy.test", "Sam");
    expect(await deleteAdmin(port, transact, "jane@effy.test", false)).toMatchObject({ cognito: "deleted", staff: "removed" });
    expect((await db.query(`SELECT status FROM admin.staff WHERE email = 'jane@effy.test'`)).rows).toEqual([{ status: "removed" }]);
    // A re-run is an answer, not an error.
    expect(await deleteAdmin(port, transact, "jane@effy.test", false)).toMatchObject({ cognito: "not-found", staff: "removed" });

    expect((await deleteAdmin(port, transact, "sam@effy.test", true)).staff).toBe("removed");
    const forced = (await db.query(`SELECT detail FROM admin.audit_log WHERE action = 'team.disabled' ORDER BY created_at DESC LIMIT 1`)).rows[0];
    expect(forced).toEqual({ detail: { forced: true } });
  });
});
