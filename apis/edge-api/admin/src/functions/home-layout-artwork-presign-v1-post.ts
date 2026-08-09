// POST /admin/v1/home-layout/artwork/presign — mint a presigned PUT for block artwork (042 US2).
//
// The console PUTs the bytes DIRECTLY to S3 and then saves the returned key through the ordinary
// draft route. ⚠ Bytes never pass through Lambda, which is what keeps a multi-megabyte photograph off
// a 5-second function.
//
// ⚠ Behind the `mutate` gate. Minting a writable object key is a mutation even though it writes no row.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapLayoutError } from "../homelayout/handler-support";
import { presignArtwork } from "../homelayout/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const body = JSON.parse(event.body ?? "{}") as { contentType?: unknown; fileSize?: unknown };
    return json(200, await presignArtwork(body.contentType, body.fileSize), scope);
  } catch (err) {
    return mapLayoutError(err, scope);
  }
};
