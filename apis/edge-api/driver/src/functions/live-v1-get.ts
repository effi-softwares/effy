// By the live authorizer's own rule (`driverScope`): only an active driver has a channel.
import { driverScope, liveRoute } from "@effy/edge-shared/live";

export const handler = liveRoute("driver", driverScope);
