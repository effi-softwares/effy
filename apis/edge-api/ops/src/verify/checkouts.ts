// SC-008 — N test-mode checkouts with repeated, interrupted and simultaneous attempts, then the
// DATABASE is asked what happened: no order paid twice, none paid incompletely.
//
// One test shopper, one checkout at a time (a shopper has one cart). The simultaneity is INSIDE each
// checkout: the intent is requested three times at once, and the return-from-provider confirmation
// four times at once, while the provider's own notification races them.
import { withDatabase, runTool } from "../db";
import { call, env, percentile, report, stripe, stripeTestKey, uuid } from "./lib";

runTool("verify-070 checkouts", async () => {
  const n = Number(process.env.CHECKOUTS ?? "200");
  stripeTestKey(); // refuse a live key BEFORE anything is created
  const token = env("CUSTOMER_ID_TOKEN");
  const access = process.env.CUSTOMER_ACCESS_TOKEN;
  const addressId = env("ADDRESS_ID");
  const productId = env("PRODUCT_ID");
  const auth = { token, access };

  const paid: string[] = [];
  const abandoned: string[] = [];
  const intentMs: number[] = [];
  const problems: string[] = [];

  for (let i = 0; i < n; i++) {
    const add = await call("POST", "/commerce/v1/cart/items", { ...auth, body: { productId, quantity: 1, changeId: uuid() } });
    if (add.status !== 200) { problems.push(`#${i} add to cart → ${add.status}`); continue; }

    // REPEATED and SIMULTANEOUS: every third checkout asks for its intent three times at once.
    const attempts = i % 3 === 0 ? 3 : 1;
    const intents = await Promise.all(Array.from({ length: attempts }, () => call("POST", "/commerce/v1/checkout/intent", { ...auth, body: { addressId, deliveryMethod: "standard" } })));
    for (const r of intents) intentMs.push(r.ms);
    const ok = intents.filter((r) => r.status === 200);
    if (ok.length !== attempts) { problems.push(`#${i} intent → ${intents.map((r) => r.status).join(",")}`); continue; }
    const orderIds = new Set(ok.map((r) => String(r.body!.orderId)));
    const secrets = new Set(ok.map((r) => String(r.body!.clientSecret)));
    if (orderIds.size !== 1 || secrets.size !== 1) problems.push(`#${i} simultaneous intents disagreed: ${orderIds.size} orders, ${secrets.size} intents`);
    const orderId = [...orderIds][0]!;
    const intentId = [...secrets][0]!.split("_secret_")[0]!;

    // INTERRUPTED: every fifth shopper walks away at the payment step. The next checkout must
    // pick the same pending order up rather than strand it.
    if (i % 5 === 4) { abandoned.push(orderId); continue; }

    await stripe("POST", `/payment_intents/${intentId}/confirm`, { payment_method: "pm_card_visa", return_url: "https://example.invalid/return" });

    // The shopper's return, four times at once, racing the provider's notification.
    const returns = await Promise.all(Array.from({ length: i % 2 === 0 ? 4 : 1 }, () => call("POST", "/commerce/v1/checkout/confirm", { ...auth, body: { orderId } })));
    if (!returns.every((r) => r.status === 200 && r.body?.paid === true)) problems.push(`#${i} confirm → ${returns.map((r) => `${r.status}/${String(r.body?.paid)}`).join(",")}`);
    paid.push(orderId);
  }

  const out = report(`SC-008 — ${n} checkouts (${paid.length} paid, ${abandoned.length} abandoned at payment)`);
  out.check("every request the harness made was answered as expected", problems.length === 0, problems.slice(0, 5).join("; "));
  out.check("start-payment p95 under 6 s (SC-006)", percentile(intentMs, 95) < 6000, `p50 ${percentile(intentMs, 50)} ms, p95 ${percentile(intentMs, 95)} ms, max ${percentile(intentMs, 100)} ms over ${intentMs.length} calls`);

  await withDatabase(async (db) => {
    const one = async (sql: string) => Number((await db.query<{ n: string }>(sql, [paid])).rows[0]!.n);
    out.check("every paid order is `paid`, once", (await one(`SELECT count(*) AS n FROM public."order" WHERE id = ANY($1::uuid[]) AND status = 'paid'`)) === new Set(paid).size);
    out.check("the same order was never returned as paid for two checkouts", new Set(paid).size === paid.length, `${paid.length - new Set(paid).size} repeats`);
    out.check("exactly one succeeded payment each, for the order's own total",
      (await one(`SELECT count(*) AS n FROM public.payment p JOIN public."order" o ON o.id = p.order_id
                   WHERE o.id = ANY($1::uuid[]) AND p.status = 'succeeded' AND p.amount = o.grand_total_amount`)) === new Set(paid).size);
    out.check("no payment intent is attached to two orders", (await one(`SELECT count(*) AS n FROM (SELECT stripe_payment_intent_id FROM public.payment WHERE order_id = ANY($1::uuid[]) GROUP BY 1 HAVING count(*) > 1) d`)) === 0);
    out.check("each has its shop portions — one per shop on the order, no more",
      (await one(`SELECT count(*) AS n FROM public."order" o WHERE o.id = ANY($1::uuid[])
                    AND (SELECT count(*) FROM public.shop_fulfillment f WHERE f.order_id = o.id)
                     <> (SELECT count(DISTINCT shop_id) FROM public.order_item i WHERE i.order_id = o.id)`)) === 0);
    out.check("each has exactly one automatic receipt queued", (await one(`SELECT count(*) AS n FROM (SELECT order_id FROM public.receipt_dispatch WHERE order_id = ANY($1::uuid[]) AND reason = 'order_paid' GROUP BY 1 HAVING count(*) <> 1) d`)) === 0);
    out.check("stock was taken at most once per product per order", (await one(`SELECT count(*) AS n FROM (SELECT order_id, product_id FROM public.stock_movement WHERE order_id = ANY($1::uuid[]) AND reason = 'order_paid' GROUP BY 1, 2 HAVING count(*) > 1) d`)) === 0);
    out.check("no same-day window went over capacity unflagged",
      (await one(`SELECT count(*) AS n FROM public.delivery_slot_booking b JOIN public.delivery_slot s ON s.id = b.slot_id
                   WHERE b.order_id = ANY($1::uuid[]) AND b.state = 'confirmed' AND NOT b.over_capacity
                     AND (SELECT count(*) FROM public.delivery_slot_booking x WHERE x.slot_id = b.slot_id AND x.delivery_date = b.delivery_date AND x.state = 'confirmed') > s.capacity`)) === 0);
  });

  // And at the provider: what was charged is what the platform recorded, once.
  let overcharged = 0;
  for (const orderId of new Set(paid)) {
    const found = (await stripe("GET", `/payment_intents/search?query=${encodeURIComponent(`metadata['order_id']:'${orderId}' AND status:'succeeded'`)}`)) as { data?: unknown[] };
    if ((found.data?.length ?? 0) > 1) overcharged++;
  }
  out.check("the provider holds at most one succeeded charge per order (0 double charges)", overcharged === 0, `${overcharged} orders with more than one`);
  out.done();
});
