// GET /admin/v1/home-layout/artwork?key=… — a presigned READ so the composer can show the operator
// their own artwork (042 US2, T061).
//
// ⚠ THIS IS MISSING FROM THE PLATFORM TODAY, AND ITS ABSENCE IS VISIBLE: the promotions console shows
// a text placeholder where an image should be, because the stored value is an S3 key and a browser
// cannot fetch one. An operator attaches a photograph and then has no way to confirm they attached
// the right one — and reviewing artwork you cannot see is not reviewing it.
//
// ⚠ READ gate, not mutate. Seeing what the storefront currently shows is support work, and this
// discloses nothing a shopper cannot already see on the page.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapLayoutError } from "../homelayout/handler-support";
import { viewArtwork } from "../homelayout/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    return json(200, await viewArtwork(event.queryStringParameters?.key), scope);
  } catch (err) {
    return mapLayoutError(err, scope);
  }
};
