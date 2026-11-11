import { bodyOf, route } from "../messages/handlers";
import { withdrawMessage } from "../messages/service";

/** Take a message back from every inbox (112 R8). */
export const handler = route((event, actor) => withdrawMessage(event.pathParameters?.id ?? "", bodyOf(event), actor));
