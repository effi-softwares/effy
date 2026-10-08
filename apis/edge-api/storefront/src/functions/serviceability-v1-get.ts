// GET /storefront/v1/serviceability?postcode=XXXX — does Effy deliver to this postcode? Public.
//
// ⚠ The answer is `coverageForPostcode`'s — the one function the address book, the checkout quote
// and the staff checker also ask — so the up-front answer and the checkout cannot disagree (076
// FR-020). `coverage` says who delivers; no reason, group or distance goes with it (FR-023).
//
// `serviced` stays for clients released before 076. It means "an order can be placed there today":
// true only for Effy's own delivery until the courier checkout exists.
//
// 077 — where Effy delivers, the answer also carries the basket OFFER: the free-delivery amount and
// the small-order fee. They depend on the basket alone, so a cart can show "Spend $10 more for free
// delivery" before there is an address to price. ⚠ An offer, never a fee.
import {
  emitMetric, json, metricNamespace, pooled, preamble, shopperHandler, unavailable, ConnectionLimitError,
} from "@effy/edge-shared";
import {
  COURIER_ORDERING_AVAILABLE, coverageForPostcode, loadActivePlan, normalizePostcode, offerDTO,
} from "@effy/edge-shared/delivery";
import type { DeliveryOfferDTO, ServiceabilityDTO } from "@effy/shared-types";

import { badRequest, queryOf } from "../lib/request";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);

  // A malformed postcode is the caller's error, NEVER "we don't deliver there".
  const postcode = normalizePostcode(queryOf(event).get("postcode") ?? "");
  if (!postcode) return badRequest("invalid_postcode", scope.requestId);

  try {
    const { kind } = await coverageForPostcode(pooled, postcode);
    // A courier answer cannot be given before a courier order can be placed; the admin service
    // will not switch courier delivery on until then, and this holds the line if the setting is
    // ever changed by hand.
    const coverage = kind === "courier" && !COURIER_ORDERING_AVAILABLE ? "none" : kind;
    const serviced = coverage !== "none";
    emitMetric(metricNamespace(), "ServiceabilityChecks", 1, { serviced: String(serviced), coverage });
    const offer = coverage === "effy" ? await offerFor(scope) : null;
    const body: ServiceabilityDTO = { postcode, serviced, coverage, ...(offer ? { offer } : {}) };
    const res = json(200, body, scope);
    // ⚠ FIVE MINUTES, NOT A DAY (076). Staff now add and remove postcodes from a screen; a day of
    // public caching would keep telling people "yes" about a postcode that had left the list,
    // while the checkout — which is never cached — refused them.
    return { ...res, headers: { ...res.headers, "cache-control": "public, max-age=300" } };
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: serviceability failed");
    return unavailable(scope);
  }
});

/**
 * The active plan's basket offer, or null. ⚠ It never fails the route: "does Effy deliver here?" has
 * an answer whether or not a fee plan can be read, and a cart without the hint is still a cart. A
 * missing plan is checkout's alarm to raise (`DeliveryQuoteFailures`), not this route's.
 */
async function offerFor(scope: { log: { warn: (o: object, msg: string) => void } }): Promise<DeliveryOfferDTO | null> {
  try {
    return offerDTO(await loadActivePlan(pooled, "effy"));
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.warn({ err }, "storefront: delivery offer not read");
    return null;
  }
}
