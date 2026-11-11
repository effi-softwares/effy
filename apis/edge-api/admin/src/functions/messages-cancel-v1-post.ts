import { bodyOf, route } from "../messages/handlers";
import { cancelMessage } from "../messages/service";

/** Cancel a scheduled message (112). */
export const handler = route((event, actor) => cancelMessage(event.pathParameters?.id ?? "", bodyOf(event), actor));
