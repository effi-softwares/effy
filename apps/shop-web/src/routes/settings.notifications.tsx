import { createRoute } from "@tanstack/react-router";

import { NotificationSettingsScreen } from "@/features/notifications/NotificationSettings";

import { appRoute } from "./app";

// Notification settings. Nested under the protected layout, so the session guard applies
// exactly as it does everywhere else.
//
// No role gate on the screen. Every operator may choose what interrupts them; the one type that
// is role-scoped (`shop_refund_proposed`) is filtered by the platform record at enqueue time, in the
// evaluator — never by hiding a switch. A preference hidden by CSS is still a preference the server
// would honour, and "the client won't show it" is not access control (Principle IV).
export const notificationSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "settings/notifications",
  component: NotificationSettingsScreen,
});
