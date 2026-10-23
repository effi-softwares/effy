// Keyed by the token subject, so this reads nothing from the database. The channel never names a shop.
import { liveRoute } from "@effy/edge-shared/live";

export const handler = liveRoute("customer", async (sub) => sub);
