// SC-010 — several staff refund ONE order at the same instant, each asking for most of it. The
// total refunded must never exceed what was paid. Then: is any refund still unresolved?
import { withDatabase, runTool } from "../db";
import { call, env, report } from "./lib";

runTool("verify-070 refund-race", async () => {
  const token = env("BACK_OFFICE_ID_TOKEN");
  const orderId = env("ORDER_ID"); // a PAID test order with nothing refunded yet
  const racers = Number(process.env.RACERS ?? "6");

  await withDatabase(async (db) => {
    const paid = (await db.query<{ cents: string }>(`SELECT round(amount * 100)::bigint AS cents FROM public.payment WHERE order_id = $1 AND status = 'succeeded'`, [orderId])).rows[0];
    if (!paid) throw new Error("ORDER_ID is not a paid order");
    const paidCents = Number(paid.cents);
    // Each asks for 60%: any two together are more than was paid.
    const each = (Math.floor(paidCents * 0.6) / 100).toFixed(2);

    const replies = await Promise.all(Array.from({ length: racers }, (_, i) =>
      call("POST", `/orders/v1/orders/${orderId}/refunds`, { token, body: { kind: "goodwill", reason: "goodwill", note: `verify-070 race ${Date.now()} #${i}`, amount: each } })));

    const out = report(`SC-010 — ${racers} simultaneous refunds of ${each} each on an order that paid ${(paidCents / 100).toFixed(2)}`);
    const accepted = replies.filter((r) => r.status === 200);
    out.check("at most one was accepted", accepted.length <= 1, `statuses: ${replies.map((r) => r.status).join(",")}`);
    out.check("the rest were refused saying what remains — not failed", replies.filter((r) => r.status !== 200).every((r) => r.status === 400), replies.filter((r) => r.status !== 200 && r.status !== 400).map((r) => `${r.status} ${String(r.body?.detail ?? "")}`).slice(0, 3).join("; "));

    const sum = async (statuses: string) => Number((await db.query<{ c: string }>(`SELECT COALESCE(SUM(round(amount * 100)), 0)::bigint AS c FROM public.refund WHERE order_id = $1 AND status IN (${statuses})`, [orderId])).rows[0]!.c);
    const committed = await sum(`'submitted','succeeded','failed','submitting'`);
    out.check("⚠ the total refunded or on its way never exceeds what was paid", committed <= paidCents, `${(committed / 100).toFixed(2)} of ${(paidCents / 100).toFixed(2)}`);

    // Uncertain refunds are resolved by the reconciler (every 5 min; alarm at 15). Watch for up to 16.
    const waitMin = Number(process.env.WAIT_MINUTES ?? "16");
    const stuck = async () => Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.refund WHERE status = 'submitting' AND created_at < now() - interval '2 minutes'`)).rows[0]!.n);
    let left = await stuck();
    for (let m = 0; left > 0 && m < waitMin; m++) {
      console.log(`  ${left} refund(s) awaiting the reconciler — checking again in a minute (${m + 1}/${waitMin})`);
      await new Promise((r) => setTimeout(r, 60_000));
      left = await stuck();
    }
    out.check("no refund is left uncertain (resolved within 15 minutes)", left === 0, `${left} still submitting`);
    out.done();
  });
});
