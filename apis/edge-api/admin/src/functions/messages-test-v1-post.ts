import { bodyOf, route } from "../messages/handlers";
import { testSend } from "../messages/service";

/** Send the message to one chosen account, every rule applied, not counted (112 R14). */
export const handler = route((event, actor) => testSend(event.pathParameters?.id ?? "", bodyOf(event), actor));
