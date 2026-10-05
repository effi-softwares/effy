// GET /commerce/v1/cart — the shopper's priced cart: lines, set-aside lines, totals, notices, the
// applied promotion and whether checkout may proceed. Prices are re-read on every call.
import { respond } from "../cart/respond";
import { customerRoute } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(({ scope, customer }) => respond(scope, () => cartService.get(customer.id)));
