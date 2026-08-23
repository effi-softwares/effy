// Repository for the in-app activity feed (049 US6): raw SQL, no ORM. Reads `driver_activity` rows —
// already written by the assignment worker (run_assigned) and lifecycle events. Scoped to the driver
// (FR-012). ⚠ Push delivery (FCM/APNs) is NOT here: it is a platform-wide notifications slice that will
// consume these same rows (constitution VII — push goes through the platform path, never per-feature).

import { query } from "@effy/edge-shared";

import type { ActivityDTO, ActivityType } from "@effy/shared-types";

interface Row {
  id: string;
  type: ActivityType;
  body: string;
  created_at: Date;
  read_at: Date | null;
  run_id: string | null;
  delivery_task_id: string | null;
}

/** GET /driver/v1/activity — chronological feed (most recent first), last 100. */
export async function listActivity(driverId: string): Promise<ActivityDTO> {
  const res = await query<Row>(
    `SELECT id, type, body, created_at, read_at, run_id, delivery_task_id
       FROM public.driver_activity
      WHERE driver_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [driverId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    type: r.type,
    body: r.body,
    createdAt: r.created_at.toISOString(),
    read: r.read_at !== null,
    runId: r.run_id,
    dropId: r.delivery_task_id,
  }));
}

/** POST /driver/v1/activity/read — mark items read. Scoped to the driver so a foreign id is a no-op. */
export async function markRead(driverId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await query(
    `UPDATE public.driver_activity SET read_at = now()
      WHERE driver_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
    [driverId, ids],
  );
}
