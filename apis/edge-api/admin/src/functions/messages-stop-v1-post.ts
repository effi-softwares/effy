import { bodyOf, route } from "../messages/handlers";
import { stopMessage } from "../messages/service";

/** Stop a message that is sending (112): those who have it keep it. */
export const handler = route((event, actor) => stopMessage(event.pathParameters?.id ?? "", bodyOf(event), actor));
