// SC-013 — shopper traffic is driven past the shopper connection limit while staff requests run.
// Shopper routes must answer a retryable 503; 100% of the staff requests must succeed.
//
// It takes the limit by HOLDING connections as the shopper role, which is exactly what a burst of
// shopper functions does. Nothing is written.
import pg from "pg";

import { parseDsn, runTool } from "../db";
import { call, env, report } from "./lib";

runTool("verify-070 overload", async () => {
  const shopperDsn = env("SHOPPER_DB_DSN"); // the effy_shopper role's DSN — NOT the master's
  const backOffice = env("BACK_OFFICE_ID_TOKEN");
  const shop = env("SHOP_ID_TOKEN");
  const cfg = parseDsn(shopperDsn);
  if (cfg.user !== "effy_shopper") throw new Error("SHOPPER_DB_DSN must connect as effy_shopper — holding the master role's connections would take the whole platform down");

  const held: pg.Client[] = [];
  try {
    // Take every connection the role is allowed. The first refusal is the limit.
    for (let i = 0; i < 200; i++) {
      const c = new pg.Client(cfg);
      try {
        await c.connect();
        held.push(c);
      } catch (err) {
        if ((err as { code?: string }).code !== "53300") throw err;
        break;
      }
    }
    console.log(`  holding ${held.length} shopper connections — the role is at its limit`);

    const shopper = () => call("GET", "/storefront/v1/categories");
    const staff = [
      () => call("GET", "/orders/v1/orders?limit=1", { token: backOffice }),
      () => call("GET", "/shop/v1/today", { token: shop }),
    ];
    const shopperReplies: Awaited<ReturnType<typeof call>>[] = [];
    const staffReplies: Awaited<ReturnType<typeof call>>[] = [];
    for (let round = 0; round < 10; round++) {
      const [s, t] = await Promise.all([
        Promise.all(Array.from({ length: 10 }, shopper)),
        Promise.all(staff.flatMap((f) => [f(), f(), f()])),
      ]);
      shopperReplies.push(...s);
      staffReplies.push(...t);
    }

    const out = report(`SC-013 — ${shopperReplies.length} shopper and ${staffReplies.length} staff requests with the shopper role at its limit (${held.length} connections)`);
    const refused = shopperReplies.filter((r) => r.status === 503);
    out.check("shopper routes were refused, not hung or failed otherwise", shopperReplies.every((r) => r.status === 503 || r.status === 200), `statuses: ${[...new Set(shopperReplies.map((r) => r.status))].join(",")}`);
    out.check("the limit was actually reached", refused.length > 0, `${refused.length} of ${shopperReplies.length} answered 503 (a warm function keeps its own connection, so some may still be served)`);
    out.check("each refusal says when to retry", refused.every((r) => r.headers.get("retry-after") !== null));
    out.check("⚠ 100% of staff requests succeeded", staffReplies.every((r) => r.status === 200), `${staffReplies.filter((r) => r.status !== 200).length} failed: ${[...new Set(staffReplies.filter((r) => r.status !== 200).map((r) => r.status))].join(",")}`);
    out.done();
  } finally {
    await Promise.all(held.map((c) => c.end().catch(() => undefined)));
  }
});
