// public.media_rendition — THE ONE WRITER (086). Raw SQL.
import { pooled, type Queryable } from "@effy/edge-shared";

export type RenditionFailure = "unsupported" | "corrupt" | "too_large";

export interface RenditionRepository {
  recordReady(key: string, widths: readonly number[], sourceWidth: number | null, sourceHeight: number | null): Promise<void>;
  recordFailed(key: string, failure: RenditionFailure, sourceWidth?: number | null, sourceHeight?: number | null): Promise<void>;
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
  };
}
