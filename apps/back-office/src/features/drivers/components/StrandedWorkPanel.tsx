import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button, Input, Label } from "@effy/design-system/ui";

import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { track } from "@/lib/telemetry";

import { canManageDrivers } from "../access";
import { driverActionError } from "../errorText";
import { formatDateTime } from "../model";
import { strandedQuery, useReleaseStranded } from "../queries";

/**
 * Work held by a driver who can no longer do it (FR-021).
 *
 * ⚠ THIS STATE EXISTS TODAY AND IS COMPLETELY INVISIBLE TODAY. The assignment sweep automatically
 * returns an ineligible driver's work to the pool — but only work they have not physically started.
 * Anything already picked up is deliberately never yanked, and its comment says why: the packages are
 * in a van, and deleting the task would make the platform forget goods that exist. Correct — except
 * that a UNIQUE constraint then keeps those packages claimed and the sweep skips them forever, with
 * an order attached to each one and nobody told.
 *
 * ⚠ RELEASING IS A CLAIM ABOUT THE PHYSICAL WORLD — the goods are back at the hub, or they are
 * written off — which is why it needs a person and a note, and why no sweep can do it.
 */
export function StrandedWorkPanel() {
  const roles = useSessionRoles();
  const canManage = canManageDrivers(roles);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery(strandedQuery());
  const release = useReleaseStranded();

  const items = data?.items ?? [];
  // Rendered only when there IS stranded work. A permanent empty panel is furniture people learn to
  // skip, and this is precisely the row that must be noticed on the day it appears.
  if (items.length === 0) return null;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function submit() {
    setError(null);
    const collectionTaskIds = items
      .filter((i) => i.kind === "collection" && selected.has(i.taskId))
      .map((i) => i.taskId);
    const deliveryTaskIds = items
      .filter((i) => i.kind === "delivery" && selected.has(i.taskId))
      .map((i) => i.taskId);

    release.mutate(
      { collectionTaskIds, deliveryTaskIds, note },
      {
        onSuccess: (res) => {
          track({ name: "driver_work_released", released: res.released });
          setSelected(new Set());
          setNote("");
        },
        onError: (e) => setError(driverActionError(e, "release")),
      },
    );
  }

  return (
    <div className="space-y-3 border-l-2 border-destructive py-1 pl-3">
      <div>
        <h3 className="text-sm font-semibold">
          Stranded work · <span className="tabular-nums">{items.length}</span>
        </h3>
        <p className="text-sm text-muted-foreground">
          These packages are with a driver who is no longer working. They will not come back on their
          own — the automatic round only reclaims work nobody has picked up yet. Find out where the
          goods are, then release them so another driver can be given them.
        </p>
      </div>

      <ul className="divide-y border-y">
        {items.map((i) => (
          <li key={i.taskId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm">
            {canManage ? (
              <input
                type="checkbox"
                aria-label={`Select ${i.orderReference}`}
                checked={selected.has(i.taskId)}
                onChange={() => toggle(i.taskId)}
                className="size-4 accent-foreground"
              />
            ) : null}
            <span className="font-mono font-medium">{i.orderReference}</span>
            <span>{i.kind === "collection" ? "Picked up, not delivered" : "Out for delivery"}</span>
            {i.location ? <span className="text-muted-foreground">{i.location}</span> : null}
            <span className="text-muted-foreground">
              with{" "}
              <Link
                to="/drivers/$driverId"
                params={{ driverId: i.driverId }}
                className="text-primary hover:underline"
              >
                {i.driverName}
              </Link>{" "}
              ({i.driverStatus})
            </span>
            <span className="tabular-nums text-muted-foreground">since {formatDateTime(i.since)}</span>
          </li>
        ))}
      </ul>

      {canManage ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor="release-note">Where are the goods?</Label>
            <Input
              id="release-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. returned to the hub by the shift supervisor"
            />
          </div>
          <Button disabled={selected.size === 0 || note.trim() === "" || release.isPending} onClick={submit}>
            {release.isPending ? "Releasing…" : `Release ${selected.size || ""}`.trim()}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
