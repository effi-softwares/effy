// The courier services Effy uses (080): validation and the rules. No SQL, no HTTP (Principle VI).
import { announce } from "@effy/edge-shared/live";
import type { CourierServiceDTO, CourierServiceInput, CourierServiceListDTO } from "@effy/shared-types";

import { CoverageError } from "./coverage.service";
import { courierSettings } from "./coverage.repository";
import * as repo from "./courier-services.repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const changed = (): Promise<void> => announce([{ scope: "ops", kind: "coverage" }]);

export async function list(): Promise<CourierServiceListDTO> {
  const [items, settings] = await Promise.all([repo.listServices(), courierSettings()]);
  return { items, collectionDefault: settings.collectionDefault };
}

type Field = { field: string; message: string };

/** Every rule a person can be told about, as field errors — never a bare 400. */
function values(body: CourierServiceInput, base: CourierServiceDTO | null): repo.ServiceValues {
  const errors: Field[] = [];
  const text = (key: "courierName" | "serviceName", min: number, max: number, label: string): string => {
    const raw = body[key] ?? base?.[key];
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v.length < min || v.length > max) errors.push({ field: key, message: `${label} is ${min} to ${max} characters` });
    return v;
  };
  const courierName = text("courierName", 2, 60, "the courier's name");
  const serviceName = text("serviceName", 2, 60, "the service's name");

  const rawEstimate = body.estimateText ?? base?.estimateText;
  const estimateText = typeof rawEstimate === "string" ? rawEstimate.trim() : "";
  if (estimateText.length < 3 || estimateText.length > 60 || /[\n\r]/.test(estimateText)) {
    errors.push({ field: "estimateText", message: 'the timeframe is 3 to 60 characters on one line, like "2–4 business days"' });
  }
  const maxBusinessDays = body.maxBusinessDays ?? base?.maxBusinessDays;
  if (typeof maxBusinessDays !== "number" || !Number.isInteger(maxBusinessDays) || maxBusinessDays < 1 || maxBusinessDays > 30) {
    errors.push({ field: "maxBusinessDays", message: "a whole number of business days, 1 to 30" });
  }
  const weekdays = body.pickupWeekdays ?? base?.pickupWeekdays;
  const pickupWeekdays = Array.isArray(weekdays) ? [...new Set(weekdays)].sort() : [];
  if (pickupWeekdays.length === 0 || pickupWeekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    errors.push({ field: "pickupWeekdays", message: "choose at least one pickup day" });
  }
  const pickupCutoff = body.pickupCutoff ?? base?.pickupCutoff;
  if (typeof pickupCutoff !== "string" || !CLOCK.test(pickupCutoff)) errors.push({ field: "pickupCutoff", message: 'a time like "14:00"' });
  const flag = (key: "collectsFromSupplier" | "isDefault"): boolean => {
    const v = body[key] ?? base?.[key] ?? false;
    if (typeof v !== "boolean") errors.push({ field: key, message: "true or false" });
    return v === true;
  };
  const collectsFromSupplier = flag("collectsFromSupplier");
  const isDefault = flag("isDefault");
  const status = body.status ?? base?.status ?? "active";
  if (status !== "active" && status !== "retired") errors.push({ field: "status", message: "active or retired" });
  if (status === "retired" && isDefault) errors.push({ field: "status", message: "the default service cannot be retired — choose another default first" });

  if (errors.length > 0) throw new CoverageError(422, "invalid_service", "check the courier service", { fields: errors });
  return {
    courierName, serviceName, estimateText, maxBusinessDays: maxBusinessDays as number, pickupWeekdays,
    pickupCutoff: pickupCutoff as string, collectsFromSupplier, status, isDefault,
  };
}

const REFUSALS: Record<repo.SaveRefusal, [409, string]> = {
  name_taken: [409, "there is already a courier service with that courier and service name"],
  default_service_required: [409, "choose another default service first: checkout tells a courier customer the default's timeframe"],
};

async function save(id: string | null, body: CourierServiceInput, base: CourierServiceDTO | null, sub: string): Promise<CourierServiceDTO> {
  const result = await repo.saveService(id, values(body ?? {}, base), sub);
  if ("refused" in result) {
    const [status, message] = REFUSALS[result.refused];
    throw new CoverageError(status, result.refused, message);
  }
  await changed();
  return (await repo.readService(result.id))!;
}

export async function create(body: CourierServiceInput, sub: string): Promise<CourierServiceDTO> {
  return save(null, body, null, sub);
}

export async function update(id: string, body: CourierServiceInput, sub: string): Promise<CourierServiceDTO> {
  if (!UUID.test(id)) throw new CoverageError(404, "service_not_found", "that courier service does not exist");
  const base = await repo.readService(id);
  if (!base) throw new CoverageError(404, "service_not_found", "that courier service does not exist");
  return save(id, body, base, sub);
}
