import { bodyOf, route } from "../messages/handlers";
import { sendMessage } from "../messages/service";

/** Send now or at a time (112 R7, R12). */
export const handler = route((event, actor) => sendMessage(event.pathParameters?.id ?? "", bodyOf(event), actor));
