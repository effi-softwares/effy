// 113 US5: what back-office's Clean-ups page shows - each clean-up's last run, when it runs next, whether it needs
// attention - and the abandon time (admins change it; every change is recorded for the activity drawer). The runs are
// written only by `recordRun` (@effy/edge-shared); this module only reads them.
import type { Queryable } from "@effy/edge-shared"
import {
  ABANDON_LIMITS,
  HOUSEKEEPING_JOBS,
  STOCK_HOLD_LIMITS,
  type HousekeepingAttention,
  type HousekeepingDTO,
  type HousekeepingJob,
  type HousekeepingRunDTO,
  type HousekeepingSettingsUpdate,
} from "@effy/shared-types"

export class HousekeepingSettingsInvalid extends Error {
  /** The field the refusal is about, for the form. */
  constructor(message: string, readonly field: string = "abandonAfterMinutes") {
    super(message)
  }
}
/** Only an administrator may change the clean-up settings (the abandon time, 114's stock hold time). */
export class HousekeepingForbidden extends Error {}
/** Someone else changed them since the page was read. */
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
    db.query<{ abandon_after_min: number; stock_hold_min: number; updated_at: Date }>(
      `SELECT abandon_after_min, stock_hold_min, updated_at FROM public.housekeeping_settings WHERE id = 1`,
    ),
  ])
  const byJob = new Map(runs.rows.map((r) => [r.job, r]))
  const s = settings.rows[0]
  if (!s) throw new Error("housekeeping_settings has no row")
  return {
    abandonAfterMinutes: s.abandon_after_min,
    stockHoldMinutes: s.stock_hold_min,
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

/** A whole number of minutes within `limits`, or the refusal that names the range. */
function minutesWithin(value: unknown, limits: { min: number; max: number }, what: string, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < limits.min || value > limits.max) {
    throw new HousekeepingSettingsInvalid(`${what} must be a whole number of minutes from ${limits.min} to ${limits.max}`, field)
  }
  return value
}

/** At least one of the two settings, and the version the page read. */
export function parseHousekeepingSettings(body: Record<string, unknown> | null): HousekeepingSettingsUpdate {
  if (!body) throw new HousekeepingSettingsInvalid("a settings object is required")
  const unknown = Object.keys(body).find((k) => k !== "abandonAfterMinutes" && k !== "stockHoldMinutes" && k !== "version")
  if (unknown) throw new HousekeepingSettingsInvalid(`${unknown} is not a clean-up setting`)
  if (body.abandonAfterMinutes === undefined && body.stockHoldMinutes === undefined) {
    throw new HousekeepingSettingsInvalid("send the abandon time, the stock hold time, or both")
  }
  const update: HousekeepingSettingsUpdate = { version: "" }
  if (body.abandonAfterMinutes !== undefined) update.abandonAfterMinutes = minutesWithin(body.abandonAfterMinutes, ABANDON_LIMITS, "the abandon time", "abandonAfterMinutes")
  if (body.stockHoldMinutes !== undefined) update.stockHoldMinutes = minutesWithin(body.stockHoldMinutes, STOCK_HOLD_LIMITS, "the stock hold time", "stockHoldMinutes")
  if (typeof body.version !== "string" || body.version === "") throw new HousekeepingSettingsInvalid("version is required")
  update.version = body.version
  return update
}

/** One transaction: the version checked under the row lock, the values, one change row per field that moved. Returns whether anything changed. */
export async function updateHousekeepingSettings(
  tx: Queryable,
  actorSub: string,
  update: HousekeepingSettingsUpdate,
  isAdmin: boolean,
): Promise<boolean> {
  if (!isAdmin) throw new HousekeepingForbidden("only an administrator can change the clean-up settings")
  const before = (
    await tx.query<{ abandon_after_min: number; stock_hold_min: number; updated_at: Date }>(
      `SELECT abandon_after_min, stock_hold_min, updated_at FROM public.housekeeping_settings WHERE id = 1 FOR UPDATE`,
    )
  ).rows[0]!
  if (new Date(before.updated_at).toISOString() !== update.version) throw new HousekeepingSettingsChanged()
  const changes: { field: "abandonAfterMinutes" | "stockHoldMinutes"; from: number; to: number }[] = []
  if (update.abandonAfterMinutes !== undefined && update.abandonAfterMinutes !== before.abandon_after_min) {
    changes.push({ field: "abandonAfterMinutes", from: before.abandon_after_min, to: update.abandonAfterMinutes })
  }
  if (update.stockHoldMinutes !== undefined && update.stockHoldMinutes !== before.stock_hold_min) {
    changes.push({ field: "stockHoldMinutes", from: before.stock_hold_min, to: update.stockHoldMinutes })
  }
  if (changes.length === 0) return false
  await tx.query(
    `UPDATE public.housekeeping_settings
        SET abandon_after_min = $1, stock_hold_min = $2, updated_by = $3, updated_at = now()
      WHERE id = 1`,
    [update.abandonAfterMinutes ?? before.abandon_after_min, update.stockHoldMinutes ?? before.stock_hold_min, actorSub],
  )
  for (const c of changes) {
    await tx.query(
      `INSERT INTO public.housekeeping_settings_change (field, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4)`,
      [c.field, String(c.from), String(c.to), actorSub],
    )
  }
  return true
}
