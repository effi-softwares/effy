// GET /customer/v1/live — which live-update channel is this customer's (071).
//
// Read once when a signed-in customer opens an order page, never on a timer. The channel is keyed
// by the customer's own token subject — the same value the live authorizer compares against — so
// this route reads NOTHING from the database: shopper traffic cannot reach it through here.
//
// ⚠ The channel names no shop and never will (FR-024). A customer is told "your orders changed";
// which shop, how many shops, and what a shop is doing are not expressible in what they receive.
import { liveRoute } from "@effy/edge-shared/live";

export const handler = liveRoute("customer", async (sub) => sub);
