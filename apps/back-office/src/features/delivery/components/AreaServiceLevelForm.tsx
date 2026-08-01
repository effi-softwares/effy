import { useState } from "react";

import type { AreaDTO, AreaServiceLevelDTO, DeliveryMethod } from "@effy/shared-types";
import { Button, Input, Label } from "@effy/design-system/ui";

const METHOD_LABELS: Record<DeliveryMethod, string> = {
  same_day: "Same-day",
  scheduled: "Scheduled",
  standard: "Standard",
};

/**
 * Configure one area's service levels and fees (031 US2).
 *
 * ── ⚠ Two disclosures this form owes the admin ─────────────────────────────────────────────────
 *
 * 1. **It configures the whole ZONE, not just this area.** `delivery_offering` is keyed on zone, so
 *    setting a fee for Ballarat sets it for Bendigo too. This is the postcode-vs-place problem one
 *    level up, and it is stated for the same reason: an admin must not believe they made a narrow
 *    decision when they made a broad one.
 *
 * 2. **⚠ Same-day is a promise, not a price.** A fee is a business choice the platform can absorb;
 *    same-day is a physical claim about time, true only if a shop holding the goods can reach the
 *    area today. So the shops are shown, and enabling it with none nearby needs an acknowledgement —
 *    which the server also enforces with a 422, because a UI-only guard is not a guard.
 */
export interface AreaServiceLevelFormProps {
  area: AreaDTO;
  /** Other areas the same zone covers — what else this change affects. */
  siblingCount: number;
  shops: { shopName: string; postcode: string | null; inZone: boolean }[];
  saving: boolean;
  onSave: (levels: (AreaServiceLevelDTO & { noNearbyShopAcknowledged?: boolean })[]) => void;
}

export function AreaServiceLevelForm({
  area,
  siblingCount,
  shops,
  saving,
  onSave,
}: AreaServiceLevelFormProps) {
  const [levels, setLevels] = useState<AreaServiceLevelDTO[]>(area.serviceLevels);
  const [acknowledged, setAcknowledged] = useState(false);

  const update = (method: DeliveryMethod, patch: Partial<AreaServiceLevelDTO>) =>
    setLevels((prev) => prev.map((l) => (l.method === method ? { ...l, ...patch } : l)));

  const sameDayOn = levels.find((l) => l.method === "same_day")?.enabled ?? false;
  const nearbyShops = shops.filter((s) => s.inZone);
  const needsAck = sameDayOn && nearbyShops.length === 0;

  return (
    <div className="space-y-4">
      {/* ⚠ Disclosure 1 — the zone-wide effect. */}
      {siblingCount > 0 && (
        <p
          data-testid="zone-wide-notice"
          className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
        >
          <span className="font-medium">
            These settings apply to all {siblingCount + 1} areas in {area.zoneCode}.
          </span>{" "}
          Delivery pricing is held per zone, so changing this area changes the others too.
        </p>
      )}

      {levels.map((level) => (
        <div key={level.method} className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{METHOD_LABELS[level.method]}</Label>
            <Button
              variant={level.enabled ? "default" : "outline"}
              size="sm"
              onClick={() => update(level.method, { enabled: !level.enabled })}
              data-testid={`toggle-${level.method}`}
            >
              {level.enabled ? "Offered" : "Not offered"}
            </Button>
          </div>

          {level.enabled && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor={`fee-${level.method}`} className="text-xs">
                  Fee
                </Label>
                <Input
                  id={`fee-${level.method}`}
                  value={level.feeAmount ?? ""}
                  inputMode="decimal"
                  placeholder="5.00"
                  className="mt-1 w-28"
                  onChange={(e) => update(level.method, { feeAmount: e.target.value })}
                />
              </div>

              {level.method === "same_day" ? (
                <div>
                  <Label htmlFor="cutoff" className="text-xs">
                    Cutoff
                  </Label>
                  <Input
                    id="cutoff"
                    value={level.sameDayCutoff ?? ""}
                    placeholder="14:00"
                    className="mt-1 w-28"
                    onChange={(e) => update(level.method, { sameDayCutoff: e.target.value })}
                  />
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <div>
                    <Label htmlFor={`min-${level.method}`} className="text-xs">
                      Days (min)
                    </Label>
                    <Input
                      id={`min-${level.method}`}
                      value={level.leadDaysMin ?? 0}
                      inputMode="numeric"
                      className="mt-1 w-20"
                      onChange={(e) =>
                        update(level.method, { leadDaysMin: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`max-${level.method}`} className="text-xs">
                      (max)
                    </Label>
                    <Input
                      id={`max-${level.method}`}
                      value={level.leadDaysMax ?? 0}
                      inputMode="numeric"
                      className="mt-1 w-20"
                      onChange={(e) =>
                        update(level.method, { leadDaysMax: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ⚠ Disclosure 2 — same-day feasibility. The shops are SHOWN, never a computed radius:
              the platform has no routing capability, and invented precision on a promise is worse
              than an honest human judgement. */}
          {level.method === "same_day" && level.enabled && (
            <div data-testid="same-day-feasibility" className="rounded-md border px-3 py-2 text-sm">
              {nearbyShops.length > 0 ? (
                <p>
                  <span className="font-medium">
                    {nearbyShops.length} shop{nearbyShops.length === 1 ? "" : "s"} in this zone:
                  </span>{" "}
                  {nearbyShops.map((s) => s.shopName).join(", ")}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium text-destructive">
                    No shop is in this zone. Same-day may not be deliverable here.
                  </p>
                  <ul className="text-muted-foreground">
                    {shops.map((s) => (
                      <li key={s.shopName}>
                        {s.shopName} —{" "}
                        {s.postcode ? (
                          s.postcode
                        ) : (
                          // ⚠ A shop with no location is a data gap the admin should see, not one
                          // the interface should conceal.
                          <span className="text-destructive">location not set</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid="ack-no-nearby-shop"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    <span>I understand, and want to offer same-day here anyway.</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 border-t pt-3">
        <Button
          disabled={saving || (needsAck && !acknowledged)}
          onClick={() =>
            onSave(
              levels.map((l) =>
                l.method === "same_day" && needsAck
                  ? { ...l, noNearbyShopAcknowledged: acknowledged }
                  : l,
              ),
            )
          }
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
