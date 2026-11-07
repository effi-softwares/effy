// The audience is fixed, so only the driver authorizer reaches it (109).
import { makeNotificationReadHandler } from "@effy/edge-shared/notifications";

export const handler = makeNotificationReadHandler("driver");
