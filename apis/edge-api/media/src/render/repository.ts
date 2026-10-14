// public.media_rendition — THE ONE WRITER (086). Raw SQL.
import { pooled, type Queryable } from "@effy/edge-shared";

export type RenditionFailure = "unsupported" | "corrupt" | "too_large";

export interface RenditionRepository {
  recordReady(key: string, widths: readonly number[], sourceWidth: number | null, sourceHeight: number | null): Promise<void>;
  recordFailed(key: string, failure: RenditionFailure, sourceWidth?: number | null, sourceHeight?: number | null): Promise<void>;
  /** Keys under `prefix` that already have a row, by status — what the backfill skips. */
  knownKeys(prefix: string): Promise<{ ready: Set<string>; failed: Set<string> }>;
}

export function createRenditionRepository(db: Queryable = pooled): RenditionRepository {
  const upsert = (key: string, status: "ready" | "failed", widths: readonly number[], w: number | null, h: number | null, failure: RenditionFailure | null) =>
    db.query(
      `
INSERT INTO public.media_rendition (storage_key, status, widths, source_width, source_height, failure, rendered_at)
VALUES ($1, $2, $3::int[], $4, $5, $6, now())
ON CONFLICT (storage_key) DO UPDATE
   SET status = EXCLUDED.status, widths = EXCLUDED.widths, source_width = EXCLUDED.source_width,
       source_height = EXCLUDED.source_height, failure = EXCLUDED.failure, rendered_at = now()`,
      [key, status, [...widths].sort((a, b) => a - b), w, h, failure],
    );

  return {
    async recordReady(key, widths, w, h) {
      await upsert(key, "ready", widths, w, h, null);
    },
    async recordFailed(key, failure, w = null, h = null) {
      await upsert(key, "failed", [], w ?? null, h ?? null, failure);
    },
    async knownKeys(prefix) {
      const rows = (
        await db.query<{ storage_key: string; status: string }>(
          `SELECT storage_key, status FROM public.media_rendition WHERE storage_key LIKE $1 || '%'`,
          [prefix],
        )
      ).rows;
      const ready = new Set<string>();
      const failed = new Set<string>();
      for (const r of rows) (r.status === "ready" ? ready : failed).add(r.storage_key);
      return { ready, failed };
    },
  };
}
