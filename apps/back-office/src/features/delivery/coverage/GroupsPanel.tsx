import { useState } from "react";

import type { CoverageGroupDTO } from "@effy/shared-types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Input, Label,
} from "@effy/design-system/ui";

import { coverageError, isNoDriverCovers, NO_DRIVER_UNGROUPED } from "../errorText";
import { useCreateCoverageGroup, useRemoveCoverageGroup, useRenameCoverageGroup } from "../queries";

const drivers = (n: number): string => (n === 0 ? "No driver can deliver here" : `${n} driver${n === 1 ? "" : "s"} can deliver here`);

/**
 * Groups (076 US5): names staff file postcodes under.
 *
 * ⚠ A group changes nothing a customer sees, is offered or pays, and removing one never removes its
 * postcodes. It has ONE operational meaning until the driver-operations feature: a driver is cleared
 * to deliver to a group, or to everywhere. So each line shows how many drivers can deliver there,
 * and postcodes in no group need a driver cleared for everywhere.
 */
export function GroupsPanel({
  groups, ungrouped, canManage,
}: { groups: CoverageGroupDTO[]; ungrouped: { postcodeCount: number; driverCount: number }; canManage: boolean }) {
  const create = useCreateCoverageGroup();
  const rename = useRenameCoverageGroup();
  const remove = useRemoveCoverageGroup();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<CoverageGroupDTO | null>(null);
  const [askNoDrivers, setAskNoDrivers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync(name.trim());
      setName("");
    } catch (err) {
      setError(coverageError(err));
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      await rename.mutateAsync({ id: editing.id, name: editing.name.trim() });
      setEditing(null);
    } catch (err) {
      setError(coverageError(err));
    }
  }

  async function confirmRemove(confirmNoDrivers: boolean) {
    if (!removing) return;
    setError(null);
    try {
      await remove.mutateAsync({ id: removing.id, confirmNoDrivers });
      setRemoving(null);
      setAskNoDrivers(false);
    } catch (err) {
      if (isNoDriverCovers(err) && !confirmNoDrivers) setAskNoDrivers(true);
      else {
        setError(coverageError(err));
        setRemoving(null);
      }
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="coverage-groups">
      <div className="space-y-1">
        <h2 id="coverage-groups" className="text-base font-semibold">Groups</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A name for a set of postcodes, to keep a long list manageable. Drivers are cleared to deliver per group,
          so each shows how many can.
        </p>
      </div>

      <ul className="divide-y rounded-md border text-sm" data-testid="coverage-groups-list">
        {groups.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            {editing?.id === g.id ? (
              <form onSubmit={saveName} className="flex flex-1 items-center gap-2">
                <Label htmlFor={`group-${g.id}`} className="sr-only">Group name</Label>
                <Input id={`group-${g.id}`} className="w-64" value={editing.name} onChange={(e) => setEditing({ id: g.id, name: e.target.value })} autoFocus />
                <Button type="submit" size="sm" disabled={rename.isPending || editing.name.trim().length < 2}>Save</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 font-medium">{g.name}</span>
                <span className="tabular-nums text-muted-foreground">{g.postcodeCount} postcode{g.postcodeCount === 1 ? "" : "s"}</span>
                <span className={g.driverCount === 0 && g.postcodeCount > 0 ? "text-warning" : "text-muted-foreground"}>{drivers(g.driverCount)}</span>
                {canManage ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing({ id: g.id, name: g.name })}>Rename</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setAskNoDrivers(false); setRemoving(g); }}>Remove</Button>
                  </>
                ) : null}
              </>
            )}
          </li>
        ))}
        <li className="flex flex-wrap items-center gap-3 px-3 py-2" data-testid="coverage-ungrouped">
          <span className="min-w-0 flex-1 text-muted-foreground">No group</span>
          <span className="tabular-nums text-muted-foreground">{ungrouped.postcodeCount} postcode{ungrouped.postcodeCount === 1 ? "" : "s"}</span>
          <span className={ungrouped.driverCount === 0 && ungrouped.postcodeCount > 0 ? "text-warning" : "text-muted-foreground"}>
            {drivers(ungrouped.driverCount)}{ungrouped.postcodeCount > 0 ? " (those cleared for everywhere)" : ""}
          </span>
        </li>
      </ul>

      {canManage ? (
        <form onSubmit={add} className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-group">New group</Label>
            <Input id="new-group" className="w-64" placeholder="Inner Melbourne" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={create.isPending || name.trim().length < 2}>Add group</Button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      <AlertDialog open={removing != null} onOpenChange={(o) => { if (!o) { setRemoving(null); setAskNoDrivers(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the group “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {askNoDrivers
                ? NO_DRIVER_UNGROUPED
                : `Its ${removing?.postcodeCount ?? 0} postcode${removing?.postcodeCount === 1 ? "" : "s"} stay on the list, in no group, and are still Delivered by Effy. Only drivers cleared for everywhere can then deliver to them.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmRemove(askNoDrivers); }}>
              {askNoDrivers ? "Remove anyway" : "Remove group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
