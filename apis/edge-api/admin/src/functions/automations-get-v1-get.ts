import { route } from "../messages/handlers";
import { getAutomation } from "../messages/automations/service";

/** One automatic message with its last 50 runs (115). */
export const handler = route((event, actor) => getAutomation(event.pathParameters?.id ?? "", actor));
