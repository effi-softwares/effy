// POST /driver/v1/notifications/seen (110). The audience is fixed, so only the driver authorizer reaches it.
import { makeInboxHandlers } from "@effy/edge-shared/notifications";

export const handler = makeInboxHandlers("driver").seen;
