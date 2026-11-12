// 113 US5: what back-office's Clean-ups page shows - each clean-up's last run, when it runs next, whether it needs
// attention - and the abandon time (admins change it; every change is recorded for the activity drawer). The runs are
// written only by `recordRun` (@effy/edge-shared); this module only reads them.
import type { Queryable } from "@effy/edge-shared"
import {
  ABANDON_LIMITS,
  HOUSEKEEPING_JOBS,
  type HousekeepingAttention,
  type HousekeepingDTO,
  type HousekeepingJob,
  type HousekeepingRunDTO,
  type HousekeepingSettingsUpdate,
} from "@effy/shared-types"

export class HousekeepingSettingsInvalid extends Error {}
/** Only an administrator may change the abandon time. */
export class HousekeepingForbidden extends Error {}
/** Someone else changed it since the page was read. */
export class HousekeepingSettingsChanged extends Error {}

interface RunRow {
  job: HousekeepingJob
  started_at: Date
  finished_at: Date
  outcome: HousekeepingRunDTO["outcome"]
  counts: Record<string, number>
  problem: string | null
}

/** Needs attention: the last run failed or partly worked, or none ran within the job's bound (the alarms' bound too). */
export function attentionOf(
  run: Pick<RunRow, "started_at" | "outcome"> | null,
  staleAfterMinutes: number,
  now: Date,
): HousekeepingAttention | null {
  if (!run) return "late"
  if (run.outcome === "failed") return "failed"
  if (now.getTime() - new Date(run.started_at).getTime() > staleAfterMinutes * 60_000) return "late"
  if (run.outcome === "partial") return "partial"
  return null
}

/** One period after the last start: a statement of the schedule, not a promise. */
export function nextRunOf(run: Pick<RunRow, "started_at"> | null, everyMinutes: number): string | null {
  return run ? new Date(new Date(run.started_at).getTime() + everyMinutes * 60_000).toISOString() : null
}

export async function readHousekeeping(db: Queryable, now: Date, mayEdit: boolean): Promise<HousekeepingDTO> {
  const [runs, settings] = await Promise.all([
    db.query<RunRow>(
      `SELECT DISTINCT ON (job) job, started_at, finished_at, outcome, counts, problem
         FROM public.housekeeping_run ORDER BY job, started_at DESC`,
    ),
    db.query<{ abandon_after_min: number; updated_at: Date }>(
      `SELECT abandon_after_min, updated_at FROM public.housekeeping_settings WHERE id = 1`,
    ),
  ])
  const byJob = new Map(runs.rows.map((r) => [r.job, r]))
  const s = settings.rows[0]
  if (!s) throw new Error("housekeeping_settings has no row")
  return {
    abandonAfterMinutes: s.abandon_after_min,
    version: new Date(s.updated_at).toISOString(),
    mayEdit,
    jobs: HOUSEKEEPING_JOBS.map((j) => {
      const r = byJob.get(j.job) ?? null
      return {
        job: j.job,
        lastRun: r
          ? {
              startedAt: new Date(r.started_at).toISOString(),
              finishedAt: new Date(r.finished_at).toISOString(),
              outcome: r.outcome,
              counts: r.counts,
              problem: r.problem,
            }
          : null,
        nextRunAt: nextRunOf(r, j.everyMinutes),
        attention: attentionOf(r, j.staleAfterMinutes, now),
      }
    }),
  }
}

export function parseHousekeepingSettings(body: Record<string, unknown> | null): HousekeepingSettingsUpdate {
  if (!body) throw new HousekeepingSettingsInvalid("a settings object is required")
  const unknown = Object.keys(body).find((k) => k !== "abandonAfterMinutes" && k !== "version")
  if (unknown) throw new HousekeepingSettingsInvalid(`${unknown} is not a clean-up setting`)
  const m = body.abandonAfterMinutes
  if (typeof m !== "number" || !Number.isInteger(m) || m < ABANDON_LIMITS.min || m > ABANDON_LIMITS.max) {
    throw new HousekeepingSettingsInvalid(
      `the abandon time must be a whole number of minutes from ${ABANDON_LIMITS.min} to ${ABANDON_LIMITS.max}`,
    )
  }
  if (typeof body.version !== "string" || body.version === "") throw new HousekeepingSettingsInvalid("version is required")
  return { abandonAfterMinutes: m, version: body.version }
}

/** One transaction: the version checked under the row lock, the value, the change recorded. Returns whether it changed. */
export async function updateHousekeepingSettings(
  tx: Queryable,
  actorSub: string,
  update: HousekeepingSettingsUpdate,
  isAdmin: boolean,
): Promise<boolean> {
  if (!isAdmin) throw new HousekeepingForbidden("only an administrator can change the abandon time")
  const before = (
    await tx.query<{ abandon_after_min: number; updated_at: Date }>(
      `SELECT abandon_after_min, updated_at FROM public.housekeeping_settings WHERE id = 1 FOR UPDATE`,
    )
  ).rows[0]!
  if (new Date(before.updated_at).toISOString() !== update.version) throw new HousekeepingSettingsChanged()
  if (before.abandon_after_min === update.abandonAfterMinutes) return false
  await tx.query(
    `UPDATE public.housekeeping_settings SET abandon_after_min = $1, updated_by = $2, updated_at = now() WHERE id = 1`,
    [update.abandonAfterMinutes, actorSub],
  )
  await tx.query(
    `INSERT INTO public.housekeeping_settings_change (field, old_value, new_value, changed_by)
     VALUES ('abandonAfterMinutes', $1, $2, $3)`,
    [String(before.abandon_after_min), String(update.abandonAfterMinutes), actorSub],
  )
  return true
}
