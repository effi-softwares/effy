// GET /notifications/healthz — liveness. Public, unversioned, dependency-free (Principle II).
import { livenessHandler } from "@effy/edge-shared";

export const handler = livenessHandler("notifications");
