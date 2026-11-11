import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { MESSAGE_KINDS, type MessageKind, type NotificationAudience } from "@effy/shared-types";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../../lib/db";
import { migrationSql } from "../../testing/migrations";
import { messageTypeFor } from "../catalogue";
import { notify, type NotifyMessage } from "../notify";
import { applyPreferencesChange, CONSENT_WORDING_VERSION } from "../preferences";

/** 112 R1 - a back-office message goes through notify(), filed by its kind, under every 111 rule. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;

const HOME: Record<NotificationAudience, NotifyMessage["destination"]> = {
  customer: { kind: "home" },
  driver: { kind: "today" },
  shop: { kind: "queue" },
};

async function messageRow(kind: MessageKind): Promise<string> {
  return (await pool.query<{ id: string }>(
    `INSERT INTO public.message (kind, title, body, created_by) VALUES ($1, 'From Effy', 'Hello from Effy', 'staff-1') RETURNING id::text AS id`,
    [kind],
  )).rows[0]!.id;
}

async function customer(): Promise<{ id: string; sub: string }> {
  const sub = `c-${++seq}`;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, ($1 || '@example.test')::citext) RETURNING id::text AS id`,
    [sub],
  )).rows[0]!.id;
  return { id, sub };
}

function messageFor(kind: MessageKind, audience: NotificationAudience, messageId: string | null): NotifyMessage {
  const filing = MESSAGE_KINDS.find((k) => k.kind === kind)!.filing[audience]!;
  return {
    messageId,
    source: kind === "direct" ? "direct" : "campaign",
    category: filing.category as NotifyMessage["category"],
    importance: filing.importance,
    title: "From Effy",
    body: "Hello from Effy",
    destination: HOME[audience],
    imageUrl: "https://media.example.test/promotions/messages-x/a.webp",
  };
}

const rows = async (sub: string) =>
  (await pool.query(
    `SELECT n.type, n.category, n.importance, n.source, n.message_id::text AS message_id, n.image_url, n.pinned_until,
            d.status AS push
       FROM public.notification n LEFT JOIN public.notification_delivery d ON d.notification_id = n.id AND d.channel = 'push'
      WHERE n.recipient_sub = $1 ORDER BY n.created_at`,
    [sub],
  )).rows;

d("notify with a message (112)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("files every kind × audience by MESSAGE_KINDS, with its source, message and picture", async () => {
    for (const k of MESSAGE_KINDS) {
      if (k.marketing) continue; // offers and news need a yes: below.
      for (const audience of Object.keys(k.filing) as NotificationAudience[]) {
        const id = await messageRow(k.kind);
        const sub = `${audience}-${k.kind}-${++seq}`;
        const message = messageFor(k.kind, audience, id);
        const created = await transact((tx) =>
          notify(tx, {
            type: messageTypeFor(audience), recipients: [{ sub }], subject: { entityId: id }, dedupeScope: id, channels: ["push"],
            pinnedUntil: message.importance === "important" ? new Date(Date.now() + 86_400_000) : null, message,
          }),
        );
        expect(created, `${k.kind} → ${audience}`).toBe(1);
        const [r] = await rows(sub);
        expect(r, `${k.kind} → ${audience}`).toMatchObject({
          type: `${audience}_message`, category: message.category, importance: message.importance, source: message.source,
          message_id: id, image_url: message.imageUrl, push: "pending",
        });
        expect(r.pinned_until !== null, `${k.kind} pinned`).toBe(message.importance === "important");
      }
    }
  });

  it("an offer reaches only a customer whose current answer is yes (111 FR-011)", async () => {
    const yes = await customer();
    const no = await customer();
    const never = await customer();
    await transact((tx) => applyPreferencesChange(tx, yes.id, { surface: "app", via: "settings", consent: { offers: true }, wordingVersion: CONSENT_WORDING_VERSION }));
    await transact((tx) => applyPreferencesChange(tx, no.id, { surface: "app", via: "settings", consent: { offers: false }, wordingVersion: CONSENT_WORDING_VERSION }));
    const id = await messageRow("offer");
    const created = await transact((tx) =>
      notify(tx, {
        type: "customer_message", recipients: [yes, no, never].map((c) => ({ sub: c.sub })), subject: { entityId: id },
        dedupeScope: id, channels: ["push"], message: messageFor("offer", "customer", id),
      }),
    );
    expect(created).toBe(1);
    expect(await rows(yes.sub)).toHaveLength(1);
    expect(await rows(no.sub)).toHaveLength(0);
    expect(await rows(never.sub)).toHaveLength(0);
  });

  it("a direct message reaches a customer who turned every switch off (support is required)", async () => {
    const c = await customer();
    await transact((tx) =>
      applyPreferencesChange(tx, c.id, {
        surface: "app", via: "settings",
        changes: [
          { category: "orders", channel: "push", enabled: false },
          { category: "points", channel: "push", enabled: false },
        ],
      }),
    );
    const id = await messageRow("direct");
    await transact((tx) =>
      notify(tx, {
        type: "customer_message", recipients: [{ sub: c.sub }], subject: { entityId: id }, dedupeScope: id, channels: ["push"],
        message: messageFor("direct", "customer", id),
      }),
    );
    expect(await rows(c.sub)).toEqual([expect.objectContaining({ category: "support", source: "direct", push: "pending" })]);
  });

  it("the same message twice writes nothing the second time (a resumed page)", async () => {
    const id = await messageRow("announcement");
    const input = {
      type: "driver_message" as const, recipients: [{ sub: "drv-twice" }], subject: { entityId: id }, dedupeScope: id,
      channels: ["push"] as const, message: messageFor("announcement", "driver", id),
    };
    expect(await transact((tx) => notify(tx, input))).toBe(1);
    expect(await transact((tx) => notify(tx, input))).toBe(0);
    expect(await rows("drv-twice")).toHaveLength(1);
  });

  it("a test send has no message id, so it is never in the report", async () => {
    const id = await messageRow("announcement");
    await transact((tx) =>
      notify(tx, {
        type: "shop_message", recipients: [{ sub: "st-test" }], subject: { entityId: id }, dedupeScope: `test:${id}:1`,
        channels: ["push"], message: { ...messageFor("announcement", "shop", null), title: "Test: From Effy" },
      }),
    );
    expect(await rows("st-test")).toEqual([expect.objectContaining({ message_id: null, source: "campaign" })]);
  });

  it("refuses a message type without its message, a system type with one, and a destination its audience can't open", async () => {
    const id = await messageRow("announcement");
    await expect(
      transact((tx) => notify(tx, { type: "driver_message", recipients: [{ sub: "x" }], subject: { entityId: id }, dedupeScope: id, channels: [] })),
    ).rejects.toThrow(/message type/);
    await expect(
      transact((tx) =>
        notify(tx, {
          type: "run_assigned", recipients: [{ sub: "x" }], subject: { entityId: "r-1" }, dedupeScope: "s", channels: [],
          message: messageFor("announcement", "driver", id),
        }),
      ),
    ).rejects.toThrow(/message type/);
    await expect(
      transact((tx) =>
        notify(tx, {
          type: "driver_message", recipients: [{ sub: "x" }], subject: { entityId: id }, dedupeScope: id, channels: [],
          message: { ...messageFor("announcement", "driver", id), destination: { kind: "sale" } },
        }),
      ),
    ).rejects.toThrow(/cannot open/);
  });
});
