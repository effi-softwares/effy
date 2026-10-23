import { customerRoute, pathParam } from "../lib/route";
import { addListToCart } from "../saved/add-to-cart-handler";

export const handler = customerRoute(({ event, scope, customer }) => addListToCart(event, scope, customer.id, pathParam(event, "listId")));
