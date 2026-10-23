// Admin/manager. Each read is judged, recorded and answered with where the bag goes; idempotent on `clientReadId`.
import { announce } from "@effy/edge-shared/live";

import { announceDispatch } from "../lib/live";
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { HubCheckinsResponseDTO, LabelReadDTO } from "@effy/shared-types";

import { validationError } from "../shared/errors";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";
import { checkIn } from "../hub/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<{ reads?: unknown }>(event.body);
    if (!Array.isArray(body.reads) || body.reads.length === 0 || body.reads.length > 50) {
      throw validationError("send between 1 and 50 reads", [{ field: "reads", message: "1–50 reads" }]);
    }
    const out = await checkIn(g.sub, body.reads as Partial<LabelReadDTO>[]);
    // Dispatch's boards, and each driver whose run moved or closed.
    if (out.results.some((r) => r.outcome === "accepted")) {
      await announceDispatch(out.drivers);
      await announce([{ scope: "ops", kind: "orders" }, ...out.shops.map((shopId) => ({ scope: "shop" as const, shopId, kind: "orders" as const }))]);
    }
    return json(200, { results: out.results } satisfies HubCheckinsResponseDTO, scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
