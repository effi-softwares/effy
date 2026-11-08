import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "@effy/edge-shared";
import { applyPreferencesChange, CONSENT_WORDING_VERSION, readPreferences } from "@effy/edge-shared/notifications";
import { activityEntries, migrationSql } from "@effy/edge-shared/testing";

import { consentActivitySource } from "../activity/consent";
import { notificationSettingsActivitySource } from "../activity/notification-settings";
import { readNotificationSettings, updateNotificationSettings } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("111 - promotion limits and a customer's consent, for back-office", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let transact: Transactor;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
    await pool.query(`INSERT INTO admin.staff (cognito_sub, email, name) VALUES ('mgr-1', 'm@effyshopping.com', 'Mia Manager')`);
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("starts at 1 a day and 3 a week, set by the migration", async () => {
    expect(await readNotificationSettings(pool)).toMatchObject({ promoPushPerDay: 1, promoPushPerWeek: 3, updatedBy: "Effy" });
  });

  it("a change writes the values, who made it, and one log entry per field that changed", async () => {
    await transact((tx) => updateNotificationSettings(tx, "mgr-1", { promoPushPerDay: 2, promoPushPerWeek: 3 }));
    expect(await readNotificationSettings(pool)).toMatchObject({ promoPushPerDay: 2, promoPushPerWeek: 3, updatedBy: "Mia Manager" });
    await transact((tx) => updateNotificationSettings(tx, "mgr-1", { promoPushPerDay: 2, promoPushPerWeek: 3 }));
    const log = await activityEntries(pool, notificationSettingsActivitySource());
    expect(log.map((e) => [e.title, e.detail, e.actor])).toEqual([["Promotional notifications per day changed", "1 → 2", "Mia Manager"]]);
  });

  it("shows a customer's choices and every yes and no, newest first, with where and the wording", async () => {
    const id = (await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('c-consent', 'c@example.test') RETURNING id::text AS id`)).rows[0]!.id;
    await transact((tx) => applyPreferencesChange(tx, id, { surface: "web", via: "prompt", consent: { offers: true }, wordingVersion: CONSENT_WORDING_VERSION }));
    await pool.query(`UPDATE public.customer_marketing_consent SET created_at = now() - interval '1 day'`);
    await transact((tx) => applyPreferencesChange(tx, id, { surface: "app", via: "inbox", consent: { offers: false }, wordingVersion: CONSENT_WORDING_VERSION, changes: [{ category: "orders", channel: "push", enabled: false }] }));

    const prefs = await readPreferences(pool, id);
    expect(prefs.consent.offers.granted).toBe(false);
    expect(prefs.categories.find((c) => c.category === "orders")).toMatchObject({ push: false, email: true });

    const log = await activityEntries(pool, consentActivitySource(id));
    expect(log.map((e) => [e.title, e.detail, e.actor])).toEqual([
      ["Said no to offers", `In the app, from an offer in their inbox. Wording ${CONSENT_WORDING_VERSION}`, "Customer"],
      ["Said yes to offers", `On the website, on the order confirmation. Wording ${CONSENT_WORDING_VERSION}`, "Customer"],
    ]);
  });
});
