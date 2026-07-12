// GET /admin/readyz — readiness. Public, unversioned. Probes the database under a 2s budget.
// The probe itself lives in @effy/edge-shared (Principle II); this file only names the service.
import { readinessHandler } from "@effy/edge-shared";

export const handler = readinessHandler("admin");
