// SC-009 — signed provider notifications delivered with duplicates, concurrency, reordering and
// faults, and the DATABASE asked afterwards: each event recorded exactly once, nothing applied twice.
//
// ⚠ What "fault" means here. This harness is outside the service, so the faults it can inject are at
// the DELIVERY: the same event sent twice at once, sent again late under a new id, sent with a bad
// signature, sent oversized. The fault INSIDE the service — handling fails halfway, the provider
// retries — is proven where it can be forced, in `commerce/src/checkout/checkout.container.test.ts`.
import { withDatabase, runTool } from "../db";
import { call, env, report, sign } from "./lib";

runTool("verify-070 webhooks", async () => {
  const secret = env("STRIPE_WEBHOOK_SECRET");
  const want = Number(process.env.DELIVERIES ?? "100");
  const run = `evt_verify070_${Date.now()}`;
  const deliver = (payload: string, signature: string) => call("POST", "/commerce/v1/stripe/webhook", { raw: payload, headers: { "stripe-signature": signature } });

  await withDatabase(async (db) => {
    // Orders this environment has ALREADY paid: a notification about them is a late or reordered
    // delivery, and applying it again would double every effect.
    const orders = (await db.query<{ order_id: string; intent: string }>(
      `SELECT p.order_id::text AS order_id, p.stripe_payment_intent_id AS intent FROM public.payment p
        WHERE p.status = 'succeeded' AND p.stripe_payment_intent_id IS NOT NULL ORDER BY p.updated_at DESC LIMIT 25`,
    )).rows;
    if (orders.length === 0) throw new Error("no paid orders to replay notifications for — run checkouts.ts first");
    const ids = orders.map((o) => o.order_id);
    const effects = async () => (await db.query<{ receipts: string; movements: string; portions: string }>(
      `SELECT (SELECT count(*) FROM public.receipt_dispatch WHERE order_id = ANY($1::uuid[])) AS receipts,
              (SELECT count(*) FROM public.stock_movement WHERE order_id = ANY($1::uuid[])) AS movements,
              (SELECT count(*) FROM public.shop_fulfillment WHERE order_id = ANY($1::uuid[])) AS portions`, [ids])).rows[0]!;
    const before = await effects();

    const statuses: number[] = [];
    const eventIds: string[] = [];
    let forged = 0;
    let sent = 0;
    for (let i = 0; sent < want; i++) {
      const o = orders[i % orders.length]!;
      const id = `${run}_${i}`;
      const payload = JSON.stringify({ id, object: "event", type: "payment_intent.succeeded", data: { object: { id: o.intent, object: "payment_intent", status: "succeeded" } } });
      eventIds.push(id);
      // The SAME event, twice at once: one must apply (as a no-op on a paid order), one must be a duplicate.
      const pair = await Promise.all([deliver(payload, sign(payload, secret)), deliver(payload, sign(payload, secret))]);
      statuses.push(...pair.map((r) => r.status));
      sent += 2;
      // Every tenth: a forged signature over a real-looking event. Must be refused and NOT recorded.
      if (i % 10 === 0) {
        const fake = JSON.stringify({ id: `${id}_forged`, object: "event", type: "payment_intent.succeeded", data: { object: { id: o.intent, object: "payment_intent", status: "succeeded" } } });
        if ((await deliver(fake, sign(fake, "whsec_not_the_secret"))).status === 400) forged++;
        else forged = -1000;
      }
    }
    const oversized = await deliver(JSON.stringify({ id: `${run}_big`, pad: "x".repeat(1_100_000) }), "t=1,v1=00");

    const out = report(`SC-009 — ${sent} signed deliveries of ${eventIds.length} events, each sent twice at once`);
    out.check("every correctly signed delivery was acknowledged", statuses.every((s) => s === 200), `non-200: ${statuses.filter((s) => s !== 200).slice(0, 8).join(",")}`);
    const recorded = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.stripe_event WHERE event_id = ANY($1::text[])`, [eventIds])).rows[0]!.n);
    out.check("each event is recorded exactly once", recorded === eventIds.length, `${recorded} rows for ${eventIds.length} events`);
    out.check("a forged signature is refused", forged > 0, `${forged} refused`);
    const forgedRows = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.stripe_event WHERE event_id LIKE $1`, [`${run}%_forged`])).rows[0]!.n);
    out.check("and leaves no record", forgedRows === 0);
    out.check("an oversized body is refused", oversized.status === 400 || oversized.status === 413, `answered ${oversized.status}`);
    const after = await effects();
    out.check("no late or repeated notification applied anything twice", JSON.stringify(after) === JSON.stringify(before), `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
    out.done();
  });
});
