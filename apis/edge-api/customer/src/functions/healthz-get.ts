// GET /customer/healthz — liveness. Public, unversioned, dependency-free.
// The probe itself lives in @effy/edge-shared (Principle II); this file only names the service.
import { livenessHandler } from "@effy/edge-shared";

export const handler = livenessHandler("customer");
