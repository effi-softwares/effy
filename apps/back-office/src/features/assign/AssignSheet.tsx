import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Badge,
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from "@effy/design-system/ui";

import { assignErrorLine, driversForQuery, useAssignTo } from "./queries";
import type { DriverFit, Stage } from "./repo";

/**
 * "Assign to…" (073) — pick a driver for one package.
 *
 * Drivers come in three groups, already sorted by the server:
 *   · Fine — pick and done.
 *   · Concern — not cleared for the area, or the round may run late. A person may decide; picking
 *     one asks once ("Assign anyway?").
 *   · Can't take it — off duty, no licence, no vehicle, van can't carry it, van full. Shown greyed
 *     with the reason, so "why isn't Ben in the list?" is never a question. The server refuses them
 *     too; greying is a courtesy.
 *
 * Every outcome is ONE line in a toast. A move is just "Assign to…" on a package someone already has.
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assign to…</SheetTitle>
          <SheetDescription>{title}</SheetDescription>
        </SheetHeader>

        <div className="px-4">
          <Input placeholder="Search drivers" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>

        {confirming ? (
          <div role="alertdialog" className="mx-4 space-y-3 rounded-md border border-border bg-warning-soft p-3 text-sm">
            <p>
              <span className="font-medium">{confirming.driver.name}:</span> {confirming.line}
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => pick(confirming.driver, true)} disabled={assign.isPending}>
                Assign anyway
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          {drivers.isPending ? <p className="text-sm text-muted-foreground">Loading drivers…</p> : null}
          {drivers.isError ? <p className="text-sm text-destructive">{assignErrorLine(drivers.error).line}</p> : null}
          {groups.map(({ fit, title: heading }) => {
            const list = shown.filter((d) => d.fit === fit);
            if (list.length === 0) return null;
            return (
              <section key={fit} aria-label={heading}>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{heading}</h3>
                <ul className="divide-y divide-border">
                  {list.map((d) => (
                    <li key={d.driverId}>
                      <button
                        type="button"
                        disabled={fit === "cannot" || assign.isPending}
                        onClick={() => pick(d)}
                        className="flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:bg-muted/50"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">{d.name}</span>
                          {d.notes.length > 0 ? (
                            <span className="block text-sm text-muted-foreground">{d.notes.join(" · ")}</span>
                          ) : null}
                        </span>
                        <Badge variant="muted">
                          {d.packagesToday} today
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
