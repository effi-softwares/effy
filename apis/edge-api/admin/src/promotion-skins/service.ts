// 095 US2 — promotion skins: validation and rules. The shape and the readability check are declared once
// in @effy/shared-types (promotion-skins.ts) and run here authoritatively: back-office runs the same
// functions as staff type, but only this service decides what is saved. Every change is announced.
import { emitMetric, metricNamespace } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";
import {
  DESIGNED_LAYOUTS,
  layoutFits,
  skinProblems,
  type AdminSkinDTO,
  type AdminSkinListItemDTO,
  type DesignedLayout,
  type SkinSettings,
} from "@effy/shared-types";

import { PromoError } from "../promotions/types";
import * as repo from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const changed = () => announce([{ scope: "ops", kind: "promotions" }]);
const notFound = () => new PromoError(404, "not_found", "skin not found");
const invalid = (field: string, message: string) => new PromoError(422, "validation_failed", `${field}: ${message}`, [{ field, message }]);
const builtIn = () => new PromoError(409, "skin_built_in", "Classic is built in: it draws each place as it always looked, and can't be changed or removed.");

function name(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < 1 || s.length > 60) throw invalid("name", "1–60 characters");
  return s;
}

function layout(v: unknown): DesignedLayout {
  if (!(DESIGNED_LAYOUTS as readonly unknown[]).includes(v)) throw invalid("layout", `one of ${DESIGNED_LAYOUTS.join(", ")}`);
  return v as DesignedLayout;
}

/** Lower-case every colour so one colour is one value (and the history compares like with like). */
function normalise(settings: SkinSettings): SkinSettings {
  return JSON.parse(JSON.stringify(settings), (_k, v) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : v)) as SkinSettings;
}

/** Refuse a skin that is malformed (422 invalid_skin) or unreadable (422 skin_unreadable, naming each pair). */
function assertSaveable(l: DesignedLayout, settings: unknown): SkinSettings {
  const { issues, unreadable } = skinProblems(l, settings as SkinSettings);
  if (issues.length > 0) throw new PromoError(422, "invalid_skin", "Some settings aren't valid.", issues);
  if (unreadable.length > 0) {
    emitMetric(metricNamespace(), "PromotionSkinUnreadable", unreadable.length);
    throw new PromoError(
      422,
      "skin_unreadable",
      `Some words would be hard to read: ${unreadable.map((p) => p.label.toLowerCase()).join("; ")}.`,
      unreadable.map((p) => ({ field: p.pair, message: `${p.label}: ${p.ratio}:1, needs ${p.required}:1` })),
    );
  }
  return normalise(settings as SkinSettings);
}

function nameTaken(err: unknown): never {
  if ((err as { code?: string }).code === "23505") throw new PromoError(409, "name_taken", "Another skin already has that name.", [{ field: "name", message: "taken" }]);
  throw err;
}

export const listSkins = (): Promise<AdminSkinListItemDTO[]> => repo.listSkins();

export async function readSkin(id: string): Promise<AdminSkinDTO> {
  if (!UUID.test(id)) throw notFound();
  return (await repo.readSkin(id)) ?? Promise.reject(notFound());
}

export async function createSkin(body: Record<string, unknown>, actor: string): Promise<AdminSkinDTO> {
  const l = layout(body.layout);
  const input = { name: name(body.name), layout: l, settings: assertSaveable(l, body.settings) };
  const id = await repo.insertSkin(input, actor).catch(nameTaken);
  await changed();
  return readSkin(id);
}

export async function updateSkin(id: string, body: Record<string, unknown>, actor: string): Promise<AdminSkinDTO> {
  if (!UUID.test(id)) throw notFound();
  if (!Number.isInteger(body.expectedVersion)) throw invalid("expectedVersion", "the version you edited");
  const current = await readSkin(id);
  if (current.builtIn) throw builtIn();
  const change: { name?: string; layout?: DesignedLayout; settings?: SkinSettings } = {};
  if ("name" in body) change.name = name(body.name);
  if ("layout" in body) change.layout = layout(body.layout);
  if ("settings" in body || change.layout) {
    change.settings = assertSaveable(change.layout ?? (current.layout as DesignedLayout), "settings" in body ? body.settings : current.settings);
  }
  const outcome = await repo
    .updateSkin(id, change, body.expectedVersion as number, actor, async (tx, cur) => {
      // A new layout must still fit every place that shows this skin.
      if (change.layout && change.layout !== cur.layout) {
        const stranded = (await repo.sizesUsing(tx, id)).filter((size) => !layoutFits(change.layout!, size));
        if (stranded.length) {
          throw new PromoError(422, "skin_does_not_fit", `A ${change.layout.replace("_", " ")} doesn't fit where this skin is used (${stranded.join(", ")}).`, [{ field: "layout", message: "doesn't fit where it is used" }]);
        }
      }
    })
    .catch(nameTaken);
  if (outcome === "missing") throw notFound();
  if (outcome === "stale") throw new PromoError(409, "skin_changed", "This skin changed while you were editing it. Here is the newer version.");
  await changed();
  return readSkin(id);
}

export async function duplicateSkin(id: string, body: Record<string, unknown>, actor: string): Promise<AdminSkinDTO> {
  const source = await readSkin(id);
  if (source.builtIn || !source.settings) throw builtIn();
  const newId = await repo
    .insertSkin({ name: name(body.name), layout: source.layout as DesignedLayout, settings: source.settings }, actor, "promotion_skin.duplicated", { from: id })
    .catch(nameTaken);
  await changed();
  return readSkin(newId);
}

export async function deleteSkin(id: string, actor: string): Promise<void> {
  if (!UUID.test(id)) throw notFound();
  const current = await readSkin(id);
  if (current.builtIn) throw builtIn();
  const outcome = await repo.deleteSkin(id, actor);
  if (outcome === "missing") throw notFound();
  if (outcome !== "deleted") {
    const where = [...outcome.groups.map((g) => g.name), ...outcome.defaultOf.map((g) => `${g.name} (default)`)];
    throw new PromoError(409, "skin_in_use", `This skin is in use: ${where.join(", ")}. Choose another skin there first.`, where.map((w) => ({ field: "usage", message: w })));
  }
  await changed();
}
