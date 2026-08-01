// GET /shop/v1/delivery-localities?q= — find real Australian places a shop could mean (032 FR-016).
//
// ⚠ The SAME query the back office uses, from @effy/edge-shared — not a copy. Two definitions of
// "a real place" would be free to drift, and one of them would be deciding what a shop just
// committed to. See apis/edge-api/shared/src/lib/localities.ts.
//
// ⚠ Read access only (any active shop member). Choosing a place is not a commitment; SUBMITTING the
// declaration is, and that is manager-gated.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import {
  isPostcodeQuery,
  json,
  localitiesForPostcode,
  LOCALITY_LIMIT,
  MIN_LOCALITY_QUERY,
  postcodeCoverage,
  preamble,
  problem,
  ProblemType,
  searchLocalitiesByName,
} from "@effy/edge-shared";

import { guard, mapDeclarationError } from "../delivery/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  const qp = event.queryStringParameters ?? {};
  const raw = (qp.q ?? "").trim();

  // ⚠ `coverage=3350` asks a different question: not "which places match" but "what does this
  // postcode COVER" — the disclosure data the console shows before a shop confirms.
  const coverage = (qp.coverage ?? "").trim();
  if (coverage) {
    if (!isPostcodeQuery(coverage)) {
      return problem(400, ProblemType.ValidationFailed, "Validation failed",
        "coverage must be a 4-digit postcode", scope, [{ field: "coverage", message: "must be 4 digits" }]);
    }
    try {
      return json(200, await postcodeCoverage(coverage), scope);
    } catch (err) {
      return mapDeclarationError(err, scope);
    }
  }

  if (raw.length < MIN_LOCALITY_QUERY) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "query too short", scope, [{ field: "q", message: `must be at least ${MIN_LOCALITY_QUERY} characters` }]);
  }

  try {
    const rows = isPostcodeQuery(raw)
      ? await localitiesForPostcode(raw)
      : await searchLocalitiesByName(raw, LOCALITY_LIMIT);
    return json(200, rows, scope);
  } catch (err) {
    return mapDeclarationError(err, scope);
  }
};
