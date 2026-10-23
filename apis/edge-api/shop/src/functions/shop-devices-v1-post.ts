// Fixes the audience, so only the shop authorizer can register a shop token.
import { makeDevicePostHandler } from "@effy/edge-shared";

export const handler = makeDevicePostHandler("shop");
