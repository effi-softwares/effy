import { respond } from "../cart/respond";
import { customerRoute } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(({ scope, customer }) => respond(scope, () => cartService.removePromo(customer.id)));
