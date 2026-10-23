// By the live authorizer's own rule (`shopScope`): an active operator at an active shop.
import { liveRoute, shopScope } from "@effy/edge-shared/live";

export const handler = liveRoute("shop", shopScope);
