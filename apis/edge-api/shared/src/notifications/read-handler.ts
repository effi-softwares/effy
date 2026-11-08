// `POST /{audience}/v1/notifications/{id}/read` (109): one factory, the audience fixed per service, so only that pool's
// authorizer can reach it. specs/109-notification-record/contracts/notification-read.md.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { NotificationAudience, NotificationReadResponseDTO } from "@effy/shared-types";

import { type AuthedEvent, subject } from "../lib/claims";
import { json, preamble, refused, unauthenticated } from "../lib/http";
import { announceInbox } from "./announce-inbox";
import { isNotificationId, markRead } from "./read";

export function makeNotificationReadHandler(
  audience: NotificationAudience,
  read: typeof markRead = markRead,
  announce: (audience: NotificationAudience, sub: string) => Promise<void> = (a, sub) => announceInbox([{ audience: a, sub }]),
) {
  return async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
    const scope = preamble(event, context);
    const sub = subject(event);
    if (!sub) return unauthenticated(scope);

    const id = event.pathParameters?.id;
    if (!isNotificationId(id)) {
      return refused(scope, 400, "invalid_notification_id", "the notification id is not valid");
    }
    const row = await read(sub, audience, id);
    // Someone else's, another audience's, or none: one answer, so nothing confirms an id exists.
    if (!row) return refused(scope, 404, "notification_not_found", "there is no such notification");
    // The person's other screens drop the unread dot (110).
    await announce(audience, sub);

    const body: NotificationReadResponseDTO = {
      notificationId: row.notificationId,
      readAt: row.readAt,
      destination: row.destination,
    };
    return json(200, body, scope);
  };
}
