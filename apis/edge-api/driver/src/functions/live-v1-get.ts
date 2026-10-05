// GET /driver/v1/live — which live-update channel is this driver's (071).
//
// Read once on sign-in and after a reconnect, never on a timer. The driver is resolved from their
// platform record by the SAME rule the live authorizer applies when the app subscribes
// (`driverScope`): an active driver. A suspended or offboarded driver has no channel.
import { driverScope, liveRoute } from "@effy/edge-shared/live";

export const handler = liveRoute("driver", driverScope);
