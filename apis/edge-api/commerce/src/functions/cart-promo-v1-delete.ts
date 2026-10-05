// DELETE /commerce/v1/cart/promo — clear the applied code. Removing one that is not applied is not
// an error. (Routed for the first time by 070 — see cart-promo-v1-post.)
import { respond } from "../cart/respond";
import { customerRoute } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(({ scope, customer }) => respond(scope, () => cartService.removePromo(customer.id)));
