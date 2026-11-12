import { route } from "../messages/handlers";
import { listAutomations } from "../messages/automations/service";

/** The Automatic messages list (115; 103): searched, filtered, sorted and paged by the address. */
export const handler = route((event) => listAutomations(event.queryStringParameters ?? {}));
