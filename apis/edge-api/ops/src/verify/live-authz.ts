// SC-005 — can anyone hear what is not theirs? Every attempt below must be REFUSED.
//
// It also settles two things the documentation implies but does not state (research ⚠ PROVE):
// that the channel's authorizer accepts the same access token the apps send to the API, and that a
// client cannot publish.
//
// Supply as many of the four access tokens as you have; attempts needing a missing one are skipped
// and counted. SC-005 asks for 50 attempts with 0 successes — all four tokens give more than that.
import { runTool } from "../db";
import { env, report } from "./lib";
import { connect, currentEpoch, describe, type LiveDescriptor } from "./live-socket";

type Audience = "shop" | "customer" | "driver" | "admin";
const TOKEN_ENV: Record<Audience, string> = {
  shop: "SHOP_ACCESS_TOKEN",
  customer: "CUSTOMER_ACCESS_TOKEN",
  driver: "DRIVER_ACCESS_TOKEN",
  admin: "BACK_OFFICE_ACCESS_TOKEN",
};
const NAMESPACE: Record<Audience, string> = { shop: "shop", customer: "customer", driver: "driver", admin: "ops" };
/** A well-formed id that is nobody's. */
const STRANGER = "00000000-0000-4000-8000-00000000dead";

runTool("verify-071 live-authz", async () => {
  env("EDGE_API_BASE_URL");
  const held: { audience: Audience; token: string; d: LiveDescriptor }[] = [];
  const out = report("SC-005 — attempts to hear what is not yours (every one must be refused)");

  for (const audience of Object.keys(TOKEN_ENV) as Audience[]) {
    const token = process.env[TOKEN_ENV[audience]];
    if (!token) { console.log(`  skip  ${audience}: ${TOKEN_ENV[audience]} not set`); continue; }
    const { status, descriptor } = await describe(audience, token);
    out.check(`${audience}: GET /${audience}/v1/live answers this person's channel`, descriptor !== null && descriptor.channelPrefix.startsWith(`/${NAMESPACE[audience]}/`), `status ${status}`);
    if (descriptor) held.push({ audience, token, d: descriptor });
  }
  if (held.length === 0) throw new Error("no access token supplied — set at least SHOP_ACCESS_TOKEN");

  let attempts = 0;
  let granted = 0;
  const refused = async (label: string, attempt: () => Promise<string>) => {
    attempts++;
    let outcome: string;
    try { outcome = await attempt(); } catch (err) { outcome = err instanceof Error ? err.message : "refused"; }
    if (outcome === "ok") granted++;
    out.check(label, outcome !== "ok", outcome === "ok" ? "GRANTED" : outcome);
  };

  for (const { audience, token, d } of held) {
    const epoch = currentEpoch(d);
    const conn = await connect(d, token);

    // The positive control: without it, "everything was refused" proves nothing.
    const own = await conn.subscribe(`${d.channelPrefix}/${epoch}`);
    out.check(`${audience}: own channel is granted (the access token is accepted)`, own === "ok", own);

    const ns = NAMESPACE[audience];
    await refused(`${audience}: a stranger's channel in the same namespace`, () => conn.subscribe(`/${ns}/${STRANGER}/${epoch}`));
    await refused(`${audience}: wildcard over the epoch`, () => conn.subscribe(`${d.channelPrefix}/*`));
    await refused(`${audience}: wildcard over the scope`, () => conn.subscribe(`/${ns}/*`));
    await refused(`${audience}: wildcard over everything`, () => conn.subscribe(`/*`));
    await refused(`${audience}: last epoch`, () => conn.subscribe(`${d.channelPrefix}/${epoch - 1}`));
    await refused(`${audience}: an epoch two ahead`, () => conn.subscribe(`${d.channelPrefix}/${epoch + 2}`));
    await refused(`${audience}: own prefix with no epoch`, () => conn.subscribe(d.channelPrefix));
    await refused(`${audience}: own channel with an extra segment`, () => conn.subscribe(`${d.channelPrefix}/${epoch}/x`));
    await refused(`${audience}: publishing to own channel`, () => conn.publish(`${d.channelPrefix}/${epoch}`));

    for (const other of Object.values(NAMESPACE).filter((n) => n !== ns)) {
      const otherHeld = held.find((h) => NAMESPACE[h.audience] === other);
      // Another audience's REAL channel when we hold one, else a well-formed one that is nobody's.
      const target = otherHeld ? `${otherHeld.d.channelPrefix}/${epoch}` : `/${other}/${other === "ops" ? "all" : STRANGER}/${epoch}`;
      await refused(`${audience}: the ${other} namespace${otherHeld ? " (a real channel)" : ""}`, () => conn.subscribe(target));
      await refused(`${audience}: publishing into the ${other} namespace`, () => conn.publish(target));
    }
    conn.close();
  }

  // Not a token at all.
  const any = held[0]!;
  await refused("a forged token cannot connect", async () => {
    const c = await connect(any.d, "not.a.token");
    c.close();
    return "ok";
  });
  await refused("a real token with one character changed cannot connect", async () => {
    const c = await connect(any.d, `${any.token.slice(0, -2)}xx`);
    c.close();
    return "ok";
  });

  out.check(`0 of ${attempts} attempts succeeded (SC-005 asks for 0 of 50)`, granted === 0 && attempts >= (held.length === 4 ? 50 : 1), `${granted} granted`);
  out.done();
});
