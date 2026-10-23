// Fixes the audience, so only the driver authorizer can register a driver token.
import { makeDevicePostHandler } from "@effy/edge-shared";

export const handler = makeDevicePostHandler("driver");
