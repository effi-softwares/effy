// POST /admin/v1/promotions/{id}/banner-image/presign — mint a presigned PUT for banner artwork (028).
//
// Two steps, the same shape `shop` already uses for product media: this returns `{ uploadUrl,
// storageKey }`, the console PUTs the bytes DIRECTLY to S3, then saves `storageKey` as
// `bannerImageKey` through the ordinary update route. **Bytes never pass through Lambda.**
//
// ⚠ Behind the same `mutate` gate as every other promotion write (`admin` / `manager`, decided from
// the admin.staff record). Minting a writable object key is a mutation even though it writes no row.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapPromoError } from "../promotions/handler-support";
import { presignBannerImage } from "../promotions/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    const body = JSON.parse(event.body ?? "{}");
    const result = await presignBannerImage(
      event.pathParameters?.id ?? "",
      body.contentType,
      body.fileSize,
    );
    return json(200, result, scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
