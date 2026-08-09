import type { HomeLayoutDTO } from "@effy/shared-types";

// The contracts double as the domain shapes for this slice — there is no reshaping to do, and
// inventing a parallel set of interfaces would be two definitions of one thing (Principle II).
export type HomeLayout = HomeLayoutDTO;

export interface AuditEntry {
  id: string;
  actorSub: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}
