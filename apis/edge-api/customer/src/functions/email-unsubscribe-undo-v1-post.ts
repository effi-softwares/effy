// POST /customer/v1/email-unsubscribe/undo (115 US2): PUBLIC - Undo on the unsubscribe page, within 7 days.
import { makeUnsubscribeHandlers } from "@effy/edge-shared/notifications";

export const handler = makeUnsubscribeHandlers().undo;
