import { bodyOf, route } from "../messages/handlers";
import { createAutomation } from "../messages/automations/service";

/** Set up an automatic message - on a trigger or a repeat; it starts running (115). */
export const handler = route((event, actor) => createAutomation(bodyOf(event), actor), 201);
