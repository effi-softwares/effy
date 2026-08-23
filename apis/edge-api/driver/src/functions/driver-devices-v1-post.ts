// POST /driver/v1/devices — register/refresh this device's FCM token for the authenticated subject
// (050-observability-push-foundation). Shared logic lives in @effy/edge-shared (Principle II); this
// file only fixes the audience so the driver authorizer is the only route that can register a driver token.
import { makeDevicePostHandler } from "@effy/edge-shared";

export const handler = makeDevicePostHandler("driver");
