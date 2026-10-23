// Fixes the audience, so only the customer authorizer can register a customer token.
import { makeDevicePostHandler } from "@effy/edge-shared";

export const handler = makeDevicePostHandler("customer");
