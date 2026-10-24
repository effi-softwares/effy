// Availability (099): every size the shop sells, its stock and its on-sale state, one page at a time.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { ShopAvailabilityDTO } from "@effy/shared-types";

import { listAvailability, parseAvailabilityQuery } from "../availability/service";
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
    const q = parseAvailabilityQuery(event.queryStringParameters ?? null);
    const page = await listAvailability(g.actor, q);
    const dto: ShopAvailabilityDTO = {
      items: await Promise.all(
        page.rows.map(async ({ storageKey, ...r }) => ({
          ...r,
          imageUrl: storageKey ? await presignRead(storageKey) : null,
        })),
      ),
      next: page.hasMore ? String(q.offset + q.limit) : null,
      counts: page.counts,
    };
    return json(200, dto, scope);
  } catch (err) {
    return mapOrderError(err, scope);
  }
};
