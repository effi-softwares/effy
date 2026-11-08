// PATCH /customer/v1/notification-preferences (111): change choices and give or withdraw consent, all or nothing.
import { makePreferencesHandlers } from "@effy/edge-shared/notifications";

export const handler = makePreferencesHandlers().patch;
