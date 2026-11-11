import { bodyOf, route } from "../messages/handlers";
import { editMessage } from "../messages/service";

/** Edit a draft or a scheduled message (112). */
export const handler = route((event, actor) => editMessage(event.pathParameters?.id ?? "", bodyOf(event), actor));
