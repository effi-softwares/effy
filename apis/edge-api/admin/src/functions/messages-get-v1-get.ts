import { route } from "../messages/handlers";
import { getMessage } from "../messages/service";

/** One message with its report (112). */
export const handler = route((event) => getMessage(event.pathParameters?.id ?? ""));
