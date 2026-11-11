import { bodyOf, route } from "../messages/handlers";
import { createMessage } from "../messages/service";

/** A new draft (112), or a duplicate of an earlier message (`fromMessageId`). */
export const handler = route((event, actor) => createMessage(bodyOf(event), actor), 201);
