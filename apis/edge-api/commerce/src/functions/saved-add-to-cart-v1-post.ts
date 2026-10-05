// POST /commerce/v1/saved/add-to-cart — add every purchasable item of "Saved" to the cart; what
// could not be added is listed with its reason. Safe to retry with the same changeId.
import { customerRoute } from "../lib/route";
import { addListToCart } from "../saved/add-to-cart-handler";
import { DEFAULT_LIST_REF } from "../saved/repository";

export const handler = customerRoute(({ event, scope, customer }) => addListToCart(event, scope, customer.id, DEFAULT_LIST_REF));
