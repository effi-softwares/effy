// DELETE /driver/v1/devices/{token} — unregister a device token, only if it belongs to the caller
// (050 FR-020; shared-device sign-out safety). Shared logic in @effy/edge-shared (Principle II).
import { makeDeviceDeleteHandler } from "@effy/edge-shared";

export const handler = makeDeviceDeleteHandler("driver");
