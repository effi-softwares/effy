import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType } from "@effy/edge-shared";

import { authenticate } from "../driver/guard";

/**
 * POST /driver/v1/delivery/drops/{dropId}/contact (049 US4, FR-023, research R6).
 *
 * ⚠ Capability-flagged. The masked-relay infrastructure (a number-masking provider) does NOT exist
 * yet, and the app MUST NEVER expose a real phone number. Until the relay is built this returns 503
 * with a stable `contact_unavailable` marker, and the client hides/disables the Contact affordance.
 * When the relay lands, this handler returns a masked channel handle.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  return problem(
    503,
    "https://effyshopping.com/problems/contact-unavailable",
    "Contact unavailable",
    "masked customer contact is not available yet",
    g.scope,
  );
};
