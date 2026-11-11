import { audienceCount } from "../messages/service";
import { bodyOf, route } from "../messages/handlers";

/** How many people a draft reaches now, and a file of emails resolved to customers (112 R4). */
export const handler = route((event) => audienceCount(bodyOf(event)));
