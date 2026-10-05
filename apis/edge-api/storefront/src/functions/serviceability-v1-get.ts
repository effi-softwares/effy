// GET /storefront/v1/serviceability?postcode=XXXX — does Effy deliver to this postcode? Public.
//
// Serviced ⇔ the postcode is in an ACTIVE delivery zone — the SAME predicate the checkout quote
// resolves its zone from, so the up-front answer and the quote can never disagree (047 FR-004).
// One answer either way (served / not), with no reason beyond it.
import {
  emitMetric, json, metricNamespace, pooled, preamble, shopperHandler, unavailable, ConnectionLimitError,
} from "@effy/edge-shared";
import { normalizePostcode, serviceableForPostcode } from "@effy/edge-shared/delivery";

import { badRequest, queryOf } from "../lib/request";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);

  // A malformed postcode is the caller's error, NEVER "we don't deliver there".
  const postcode = normalizePostcode(queryOf(event).get("postcode") ?? "");
  if (!postcode) return badRequest("invalid_postcode", scope.requestId);

  try {
    const serviced = await serviceableForPostcode(pooled, postcode);
    emitMetric(metricNamespace(), "ServiceabilityChecks", 1, { serviced: String(serviced) });
    const res = json(200, { postcode, serviced }, scope);
    // A postcode's zone changes rarely; a day of caching keeps this read off the database.
    return { ...res, headers: { ...res.headers, "cache-control": "public, max-age=86400" } };
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: serviceability failed");
    return unavailable(scope);
  }
});
