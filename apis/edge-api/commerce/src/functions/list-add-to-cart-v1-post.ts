// POST /commerce/v1/lists/{listId}/add-to-cart — add every purchasable item of one list to the
// cart. Safe to retry with the same changeId.
import { customerRoute, pathParam } from "../lib/route";
import { addListToCart } from "../saved/add-to-cart-handler";

export const handler = customerRoute(({ event, scope, customer }) => addListToCart(event, scope, customer.id, pathParam(event, "listId")));
