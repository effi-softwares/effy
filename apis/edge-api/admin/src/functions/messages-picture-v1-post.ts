import { bodyOf, route } from "../messages/handlers";
import { pictureUpload } from "../messages/service";

/** A presigned upload for a message picture, under the public promotions prefix (112 R9). */
export const handler = route((event, actor) => pictureUpload(event.pathParameters?.id ?? "", bodyOf(event), actor));
