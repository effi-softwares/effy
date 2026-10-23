import { customerRoute } from "../lib/route";
import { addListToCart } from "../saved/add-to-cart-handler";
import { DEFAULT_LIST_REF } from "../saved/repository";

export const handler = customerRoute(({ event, scope, customer }) => addListToCart(event, scope, customer.id, DEFAULT_LIST_REF));
