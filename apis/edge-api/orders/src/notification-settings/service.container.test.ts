import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "@effy/edge-shared";
import {
  applyPreferencesChange, CONSENT_WORDING_VERSION, EMAIL_WORDING_VERSION, readPreferences, undoEmailUnsubscribe, unsubscribeFromEmail,
} from "@effy/edge-shared/notifications";
import { activityEntries, migrationSql } from "@effy/edge-shared/testing";

import { consentActivitySource } from "../activity/consent";
import { notificationSettingsActivitySource } from "../activity/notification-settings";
import { NotificationSettingsForbidden, readNotificationSettings, updateNotificationSettings } from "./service";

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
    await transact((tx) => updateNotificationSettings(tx, "mgr-1", { promoPushPerDay: 2, promoPushPerWeek: 3, maxRecipientsPerMessage: 20000 }));
    expect(await readNotificationSettings(pool)).toMatchObject({ promoPushPerDay: 2, promoPushPerWeek: 3, updatedBy: "Mia Manager" });
    await transact((tx) => updateNotificationSettings(tx, "mgr-1", { promoPushPerDay: 2, promoPushPerWeek: 3, maxRecipientsPerMessage: 20000 }));
    const log = await activityEntries(pool, notificationSettingsActivitySource());
    expect(log.map((e) => [e.title, e.detail, e.actor])).toEqual([["Promotional notifications per day changed", "1 → 2", "Mia Manager"]]);
  });

  it("only an administrator changes the largest message; a manager's change to it is refused (112 FR-021)", async () => {
    await expect(
      transact((tx) => updateNotificationSettings(tx, "mgr-1", { promoPushPerDay: 2, promoPushPerWeek: 3, maxRecipientsPerMessage: 500 })),
    ).rejects.toBeInstanceOf(NotificationSettingsForbidden);
    await transact((tx) => updateNotificationSettings(tx, "mgr-1", { promoPushPerDay: 2, promoPushPerWeek: 3, maxRecipientsPerMessage: 500 }, true));
    expect(await readNotificationSettings(pool)).toMatchObject({ maxRecipientsPerMessage: 500 });
    await transact((tx) => updateNotificationSettings(tx, "mgr-1", { promoPushPerDay: 2, promoPushPerWeek: 3, maxRecipientsPerMessage: 20000 }, true));
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

  it("115: email answers say 'by email', and an unsubscribe says where it came from", async () => {
    const id = (await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('c-email', 'e@example.test') RETURNING id::text AS id`)).rows[0]!.id;
    await transact((tx) => applyPreferencesChange(tx, id, { surface: "web", via: "settings", consent: { offers: true }, wordingVersion: CONSENT_WORDING_VERSION }));
    await transact((tx) => applyPreferencesChange(tx, id, { surface: "app", changes: [{ category: "offers", channel: "email", enabled: true }], emailWordingVersion: EMAIL_WORDING_VERSION }));
    // Distinct times, so the log's order never rests on a random id.
    await pool.query(`UPDATE public.customer_marketing_consent SET created_at = now() - interval '3 days' WHERE customer_id = $1 AND channel = 'notifications'`, [id]);
    await pool.query(`UPDATE public.customer_marketing_consent SET created_at = now() - interval '2 days' WHERE customer_id = $1 AND channel = 'email'`, [id]);
    await transact((tx) => unsubscribeFromEmail(tx, id, null, "one_click"));
    await pool.query(`UPDATE public.customer_marketing_consent SET created_at = now() - interval '1 day' WHERE customer_id = $1 AND via = 'one_click'`, [id]);
    await transact((tx) => undoEmailUnsubscribe(tx, id));

    const log = await activityEntries(pool, consentActivitySource(id));
    expect(log.map((e) => [e.title, e.detail])).toEqual([
      ["Said yes to offers by email", `From an email, through the unsubscribe link. Wording ${EMAIL_WORDING_VERSION}`],
      ["Said no to offers by email", `From an email, with their mail program's unsubscribe button. Wording ${EMAIL_WORDING_VERSION}`],
      ["Said yes to offers by email", `In the app, in Notification settings. Wording ${EMAIL_WORDING_VERSION}`],
      ["Said yes to offers", `On the website, in Notification settings. Wording ${CONSENT_WORDING_VERSION}`],
    ]);
  });
});
