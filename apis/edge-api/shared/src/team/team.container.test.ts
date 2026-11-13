import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { staffNameSql } from "../lib/activity";
import { transactorFor, type Transactor } from "../lib/db";
import { TeamRefusalError } from "./errors";
import { readMember } from "./read";
import { addMember, changeRole, OPERATOR, removeMember, renameMember, setStatus } from "./writer";

/** 119 - the team's one writer against the real schema: the backfill, the last-admin race, stale views, re-adding. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const MIGRATIONS = resolve(__dirname, "../../../../../db/migrations");
const TEAM_MIGRATION = "20261114090000_backoffice_team.sql";

function upHalf(file: string): string {
  const sql = readFileSync(resolve(MIGRATIONS, file), "utf8");
  return sql.slice(sql.indexOf("-- +goose Up"), sql.indexOf("-- +goose Down")).replace(/\bINDEX CONCURRENTLY\b/g, "INDEX");
}

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;

const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof TeamRefusalError ? e.type : (e as Error).message),
  );

d("119 - the back-office team against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    transact = transactorFor(pool);
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    const before = files.filter((f) => f < TEAM_MIGRATION);
    await pool.query(before.map(upHalf).join("\n\n"));

    // Rows as the old token reconcile left them: several roles, none, and a username for an email.
    await pool.query(`
      INSERT INTO admin.staff (id, cognito_sub, email, name) VALUES
        ('00000000-0000-0000-0000-0000000000a1', 'old-a', 'Ann@Effy.test ', 'Ann'),
        ('00000000-0000-0000-0000-0000000000a2', 'old-b', 'bo@effy.test', NULL),
        ('00000000-0000-0000-0000-0000000000a3', 'old-c', '3f2a9c1e-uuid', NULL);
      INSERT INTO admin.staff_role (staff_id, role_key) VALUES
        ('00000000-0000-0000-0000-0000000000a1', 'csa'), ('00000000-0000-0000-0000-0000000000a1', 'admin'),
        ('00000000-0000-0000-0000-0000000000a3', 'manager');`);
    await pool.query(upHalf(TEAM_MIGRATION));
    await pool.query(files.filter((f) => f > TEAM_MIGRATION).map(upHalf).join("\n\n") || "SELECT 1");
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("the backfill: one role (the highest), no-role people disabled, a username marked, each audited by Effy", async () => {
    const rows = (
      await pool.query(`SELECT s.email::text AS email, s.status, s.sign_in_issue, sr.role_key
                          FROM admin.staff s LEFT JOIN admin.staff_role sr ON sr.staff_id = s.id ORDER BY s.id`)
    ).rows;
    expect(rows).toEqual([
      { email: "ann@effy.test", status: "active", sign_in_issue: null, role_key: "admin" },
      { email: "bo@effy.test", status: "disabled", sign_in_issue: "no_role", role_key: null },
      { email: "3f2a9c1e-uuid", status: "active", sign_in_issue: "email_differs", role_key: "manager" },
    ]);
    const audit = (await pool.query(`SELECT actor_sub, action, detail FROM admin.audit_log ORDER BY action`)).rows;
    expect(audit).toEqual([
      { actor_sub: "system:119", action: "team.disabled", detail: { reason: "no_role" } },
      { actor_sub: "system:119", action: "team.role_changed", detail: { from: ["admin", "csa"], to: "admin", reason: "one_role" } },
    ]);
    const name = (await pool.query(`SELECT ${staffNameSql("'system:119'::text")} AS n`)).rows[0];
    expect(name).toEqual({ n: "Effy" });
  });

  it("UNIQUE (staff_id): a second role is refused by the database itself", async () => {
    await expect(
      pool.query(`INSERT INTO admin.staff_role (staff_id, role_key) VALUES ('00000000-0000-0000-0000-0000000000a1', 'csa')`),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("adds a person with one role; the same email again is refused, any case", async () => {
    const { staffId } = await transact((tx) =>
      addMember(tx, { sub: "old-a" }, { email: "cy@x.test", name: " Cy  Lee ", role: "csa", sub: "sub-cy", adopted: false, invite: true }),
    );
    const cy = await readMember(pool, staffId, "old-a");
    expect(cy).toMatchObject({ name: "Cy Lee", role: "csa", status: "active", lastSeenAt: null, addedBy: { name: "Ann" }, isYou: false });
    expect(await refusal(transact((tx) => addMember(tx, OPERATOR, { email: " CY@X.test", name: "Cy", role: "admin", sub: "sub-cy2", adopted: false, invite: false })))).toBe(
      "already_on_team",
    );
  });

  it("the last administrator cannot be disabled or lowered, even by two at once (FR-022)", async () => {
    const { staffId: dee } = await transact((tx) =>
      addMember(tx, OPERATOR, { email: "dee@x.test", name: "Dee", role: "admin", sub: "sub-dee", adopted: false, invite: false }),
    );
    const ann = "00000000-0000-0000-0000-0000000000a1";
    // Ann and Dee lower each other at the same moment: exactly one succeeds.
    const results = await Promise.all([
      refusal(transact((tx) => changeRole(tx, { sub: "old-a" }, dee, "manager"))),
      refusal(transact((tx) => changeRole(tx, { sub: "sub-dee" }, ann, "manager"))),
    ]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results.filter((r) => r === "last_admin")).toHaveLength(1);

    const admins = (await pool.query(`SELECT count(*)::int AS n FROM admin.staff s JOIN admin.staff_role sr ON sr.staff_id = s.id
                                       WHERE s.status = 'active' AND sr.role_key = 'admin'`)).rows[0];
    expect(admins).toEqual({ n: 1 });
    const lastAdmin = results[0] === null ? ann : dee;
    expect(await refusal(transact((tx) => setStatus(tx, OPERATOR, lastAdmin, "disabled")))).toBe("last_admin");
  });

  it("never yourself (FR-023), and a stale view is refused (FR-024)", async () => {
    const ann = "00000000-0000-0000-0000-0000000000a1";
    const self = (await readMember(pool, ann, "old-a"))!;
    expect(self.actions).toEqual(["rename"]);
    expect(await refusal(transact((tx) => setStatus(tx, { sub: "old-a" }, ann, "disabled")))).toBe("not_yourself");

    const manager = "00000000-0000-0000-0000-0000000000a3";
    const seen = (await readMember(pool, manager, "old-a"))!.revision;
    await transact((tx) => renameMember(tx, OPERATOR, manager, "Mo", seen));
    expect(await refusal(transact((tx) => changeRole(tx, OPERATOR, manager, "csa", seen)))).toBe("staff_changed");
  });

  it("re-enabling a person with no role asks for one, then restores access", async () => {
    const bo = "00000000-0000-0000-0000-0000000000a2";
    expect(await refusal(transact((tx) => setStatus(tx, OPERATOR, bo, "active")))).toBe("role_required");
    await transact((tx) => setStatus(tx, OPERATOR, bo, "active", { role: "csa" }));
    expect(await readMember(pool, bo, "x")).toMatchObject({ status: "active", role: "csa", signInIssue: null });
  });

  it("an active person cannot be removed; a removed one added again is the same person, their old actions still named", async () => {
    const { staffId } = await transact((tx) =>
      addMember(tx, OPERATOR, { email: "eve@x.test", name: "Eve", role: "manager", sub: "sub-eve-1", adopted: false, invite: false }),
    );
    await pool.query(`INSERT INTO admin.audit_log (actor_sub, action, target_type, detail) VALUES ('sub-eve-1', 'order.note', 'order', '{}')`);
    expect(await refusal(transact((tx) => removeMember(tx, OPERATOR, staffId)))).toBe("not_disabled");
    await transact((tx) => setStatus(tx, OPERATOR, staffId, "disabled"));
    await transact((tx) => removeMember(tx, OPERATOR, staffId));
    expect(await readMember(pool, staffId, "x")).toMatchObject({ status: "removed", removedBy: { name: "Operator" }, actions: ["rename"] });

    const again = await transact((tx) =>
      addMember(tx, OPERATOR, { email: "EVE@x.test", name: "Eve", role: "csa", sub: "sub-eve-2", adopted: false, invite: false }),
    );
    expect(again).toEqual({ staffId, readded: true });
    expect(await readMember(pool, staffId, "x")).toMatchObject({ subject: "sub-eve-2", status: "active", role: "csa", removedAt: null });
    const named = (await pool.query(`SELECT ${staffNameSql("a.actor_sub")} AS n FROM admin.audit_log a WHERE a.action = 'order.note'`)).rows[0];
    expect(named).toEqual({ n: "Eve" });
  });
});
