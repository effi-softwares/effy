// GET /shop/v1/live — which live-update channel is this operator's (071).
//
// Read once on sign-in and after a reconnect, never on a timer. The shop is resolved from the
// operator's platform record by the SAME rule the live authorizer applies when the app subscribes
// (`shopScope`): an active operator at an active shop. There is no shop parameter to supply.
import { liveRoute, shopScope } from "@effy/edge-shared/live";

export const handler = liveRoute("shop", shopScope);
