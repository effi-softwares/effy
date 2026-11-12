// POST /customer/v1/email-unsubscribe (115 US2): PUBLIC - the unsubscribe link in a marketing email, or a mail program's
// one-click button (?t=…&m=…). Always 200, one shape: a wrong token reveals nothing.
import { makeUnsubscribeHandlers } from "@effy/edge-shared/notifications";

export const handler = makeUnsubscribeHandlers().unsubscribe;
