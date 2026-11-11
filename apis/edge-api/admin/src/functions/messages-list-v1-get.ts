import { listMessages } from "../messages/service";
import { route } from "../messages/handlers";

/** The Messages list (112; 103): searched, filtered, sorted and paged by the address. */
export const handler = route((event) => listMessages(event.queryStringParameters ?? {}));
