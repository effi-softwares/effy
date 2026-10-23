// Only a token that belongs to the caller.
import { makeDeviceDeleteHandler } from "@effy/edge-shared";

export const handler = makeDeviceDeleteHandler("customer");
