import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CircleAlert, Search } from "lucide-react";

import { Badge, Button, Input, Skeleton, toast } from "@effy/design-system/ui";

import { ResponsiveSheet } from "@/components/patterns/ResponsiveSheet";
import { Callout } from "@/components/patterns/States";
import { initialsOf } from "@/components/shell/identity";

import { assignErrorLine, driversForQuery, useAssignTo } from "./queries";
import type { DriverFit, Stage } from "./repo";

/**
 * "Assign to…" — pick a driver for one package.
 *
 * Drivers come in three groups, already sorted by the server:
 *  · Fine — pick and done.
 *  · Concern — not cleared for the area, or the round may run late. A person may decide; picking
 *  one asks once ("Assign anyway?").
 *  · Can't take it — off duty, no licence, no vehicle, van can't carry it, van full. Shown greyed
 *  with the reason, so "why isn't Ben in the list?" is never a question. The server refuses them
 *  too; greying is a courtesy.
 *
 * Every outcome is one line in a toast. A move is just "Assign to…" on a package someone already has.
 */
export function AssignSheet({
  open,
  onOpenChange,
  packageId,
  stage,
  expectedAssignmentId,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageId: string;
  stage: Stage;
  expectedAssignmentId: string | null;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState<{ driver: DriverFit; line: string } | null>(null);
  const drivers = useQuery({ ...driversForQuery(packageId, stage), enabled: open });
  const assign = useAssignTo(packageId);

  const pick = (driver: DriverFit, acceptConcerns = false) => {
    assign.mutate(
      { stage, driverId: driver.driverId, expectedAssignmentId, acceptConcerns },
      {
        onSuccess: (res) => {
          toast(res.message);
          setConfirming(null);
          onOpenChange(false);
        },
        onError: (err) => {
          const { line, needsConfirm } = assignErrorLine(err);
          if (needsConfirm) setConfirming({ driver, line });
          else {
            toast(line);
            setConfirming(null);
          }
        },
      },
    );
  };

  const shown = (drivers.data ?? []).filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase()));
  const groups: Array<{ fit: DriverFit["fit"]; title: string }> = [
    { fit: "fine", title: "Can take it" },
    { fit: "concern", title: "Can take it, with a concern" },
    { fit: "cannot", title: "Can't take it" },
  ];

  const tone: Record<DriverFit["fit"], string> = { fine: "bo-avatar--green", concern: "bo-avatar--blue", cannot: "" };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Assign to…"
      description={title}
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      }
    >
      <label className="relative flex items-center">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
        <span className="sr-only">Search drivers</span>
        <Input className="pl-[34px]!" placeholder="Search drivers" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      </label>

      {confirming ? (
        <div role="alertdialog" className="bo-alert bo-alert--muted">
          <CircleAlert aria-hidden="true" />
          <div className="bo-alert__title">
            {confirming.driver.name}: {confirming.line}
          </div>
          <div className="bo-alert__description mt-2 flex gap-2">
            <Button size="sm" onClick={() => pick(confirming.driver, true)} disabled={assign.isPending}>
              Assign anyway
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {drivers.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : null}
      {drivers.isError ? <Callout tone="destructive" title={assignErrorLine(drivers.error).line} /> : null}
      {groups.map(({ fit, title: heading }) => {
        const list = shown.filter((d) => d.fit === fit);
        if (list.length === 0) return null;
        return (
          <section key={fit} aria-label={heading} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <h3 className="font-medium text-muted-foreground">{heading}</h3>
              <span className="text-muted-foreground">
                {list.length} {list.length === 1 ? "driver" : "drivers"}
              </span>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {list.map((d) => (
                <li key={d.driverId}>
                  <button
                    type="button"
                    disabled={fit === "cannot" || assign.isPending}
                    onClick={() => pick(d)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left first:rounded-t-lg last:rounded-b-lg enabled:hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className={`bo-avatar bo-avatar--sq ${tone[fit]}`} aria-hidden="true">
                      {initialsOf(d.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{d.name}</span>
                      {d.notes.length > 0 ? <span className="bo-sub">{d.notes.join(" · ")}</span> : null}
                    </span>
                    <Badge variant="secondary">{d.packagesToday} today</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">
        The server decides who can take it. Drivers who can't stay listed with the reason, so "why isn't Ben here?" never needs asking.
      </p>
    </ResponsiveSheet>
  );
}
