// SC-001 / SC-002 — how long after an order is paid does an open shop screen hear about it?
//
// A shop operator's connection is opened exactly as the console opens it; N test-mode orders are
// then paid as a shopper, and for each the time from asking the provider to take the payment to the
// update arriving on the shop's channel is recorded.
//
// ⚠ THE FIGURE IS AN UPPER BOUND. The clock starts BEFORE the provider is asked to confirm the
// payment — the platform cannot have committed earlier than that — so each figure includes the
// provider's own second or two. The true commit-to-update time is shorter than what is printed;
// a pass here is a pass with room.
//
// ⚠ It depends on nothing a push notification does: this script registers no device and holds no
// notification permission (FR-007).
import { runTool } from "../db";
import { call, env, percentile, report, stripe, stripeTestKey, uuid } from "./lib";
import { connect, currentEpoch, describe } from "./live-socket";

runTool("verify-071 live-latency", async () => {
  const n = Number(process.env.ORDERS ?? "20");
  stripeTestKey(); // refuse a live key BEFORE anything is created
  const shopToken = env("SHOP_ACCESS_TOKEN");
  const customer = { token: env("CUSTOMER_ID_TOKEN"), access: process.env.CUSTOMER_ACCESS_TOKEN };
  const addressId = env("ADDRESS_ID");
  const productId = env("PRODUCT_ID"); // a product THIS shop fulfils, or the shop is never told

  const { status, descriptor } = await describe("shop", shopToken);
  if (!descriptor) throw new Error(`GET /shop/v1/live answered ${status} — no channel for this operator`);

  const live = await connect(descriptor, shopToken);
  const subscribed = await live.subscribe(`${descriptor.channelPrefix}/${currentEpoch(descriptor)}`);
  if (subscribed !== "ok") throw new Error(`own channel refused: ${subscribed}`);

  const arrivals: number[] = [];
  live.onUpdate((at, kind) => {
    if (kind === "orders") arrivals.push(at);
  });

  const latencies: number[] = [];
  const problems: string[] = [];
  for (let i = 0; i < n; i++) {
    const add = await call("POST", "/commerce/v1/cart/items", { ...customer, body: { productId, quantity: 1, changeId: uuid() } });
    const intent = await call("POST", "/commerce/v1/checkout/intent", { ...customer, body: { addressId, deliveryMethod: "standard" } });
    if (add.status !== 200 || intent.status !== 200) { problems.push(`#${i} cart ${add.status} / intent ${intent.status}`); continue; }
    const orderId = String(intent.body!.orderId);
    const intentId = String(intent.body!.clientSecret).split("_secret_")[0]!;

    const seenBefore = arrivals.length;
    const started = performance.now();
    await stripe("POST", `/payment_intents/${intentId}/confirm`, { payment_method: "pm_card_visa", return_url: "https://example.invalid/return" });
    const confirm = await call("POST", "/commerce/v1/checkout/confirm", { ...customer, body: { orderId } });
    if (confirm.status !== 200 || confirm.body?.paid !== true) { problems.push(`#${i} confirm ${confirm.status}`); continue; }

    // Wait up to 15 s (SC-001's outer bound) for the update this payment caused.
    const deadline = performance.now() + 15_000;
    while (arrivals.length === seenBefore && performance.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    if (arrivals.length === seenBefore) { problems.push(`#${i} no update within 15 s`); latencies.push(Infinity); continue; }
    latencies.push(arrivals[seenBefore]! - started);
    // Let any second copy (the webhook racing the return) land before the next order starts.
    await new Promise((r) => setTimeout(r, 1_500));
  }
  live.close();

  const heard = latencies.filter(Number.isFinite);
  const out = report(`SC-001 / SC-002 — ${n} paid orders, time from asking the provider to the shop's update (upper bound)`);
  out.check("every request the harness made was answered as expected", problems.filter((p) => !p.includes("no update")).length === 0, problems.slice(0, 5).join("; "));
  out.check("every paid order produced an update on the shop's channel (SC-002)", heard.length === latencies.length && latencies.length > 0, `${heard.length} of ${latencies.length}`);
  out.check("95% within 5 s (SC-001)", latencies.length > 0 && percentile(latencies, 95) < 5_000, `p50 ${percentile(heard, 50)} ms, p95 ${percentile(heard, 95)} ms, max ${percentile(heard, 100)} ms`);
  out.check("99% within 15 s (SC-001)", latencies.length > 0 && percentile(latencies, 99) < 15_000);
  out.done();
});
