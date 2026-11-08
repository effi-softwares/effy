// GET /customer/v1/notification-preferences (111): the signed-in customer's choices, consent and the offers ask.
import { makePreferencesHandlers } from "@effy/edge-shared/notifications";

export const handler = makePreferencesHandlers().get;
