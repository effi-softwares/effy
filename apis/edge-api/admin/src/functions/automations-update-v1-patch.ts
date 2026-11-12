import { bodyOf, route } from "../messages/handlers";
import { editAutomation } from "../messages/automations/service";

/** Edit an automatic message; future runs only, version-checked (115). */
export const handler = route((event, actor) => editAutomation(event.pathParameters?.id ?? "", bodyOf(event), actor));
