// POST /customer/v1/notifications/read-all (110). The audience is fixed, so only the customer authorizer reaches it.
import { makeInboxHandlers } from "@effy/edge-shared/notifications";

export const handler = makeInboxHandlers("customer").readAll;
