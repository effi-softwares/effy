// Availability (099): every size the shop sells, its stock and its on-sale state — a console list (103).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, offsetListPage, parseListQuery, preamble } from "@effy/edge-shared";
import type { ShopAvailabilityDTO } from "@effy/shared-types";

import { AVAILABILITY_LIST_SPEC } from "../availability/list";
import { listAvailability } from "../availability/service";
import { gate, mapOrderError } from "../orders/handler-support";
import { presignRead } from "../products/media";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  try {
    const req = parseListQuery(event.queryStringParameters, AVAILABILITY_LIST_SPEC);
    const page = await listAvailability(g.actor, req);
    const items = await Promise.all(
      page.rows.map(async ({ storageKey, ...r }) => ({ ...r, imageUrl: storageKey ? await presignRead(storageKey) : null })),
    );
    const dto: ShopAvailabilityDTO = { ...offsetListPage(items, req, page), counts: page.counts };
    return json(200, dto, scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapOrderError(err, scope);
  }
};
