import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@effy/design-system/ui";

import { deliveryMutationError } from "../errorText";
import { ringsQuery, useCreateZone } from "../queries";

// Create a served zone (047). A zone must start with a ring; the platform can suggest a better one once
// the zone has postcodes (FR-015).
export function NewZoneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateZone();
  const { data: rings } = useQuery(ringsQuery());
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ringId, setRingId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ code: code.trim(), name: name.trim(), ringId });
      setCode(""); setName(""); setRingId("");
      onOpenChange(false);
    } catch (err) {
      setError(deliveryMutationError(err, "A zone with that code already exists."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New served zone</DialogTitle>
          <DialogDescription>Add places to it afterwards, then run “Suggest ring”.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="zone-code">Code</Label>
            <Input id="zone-code" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder="MEL-INNER-NORTH" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zone-name">Name</Label>
            <Input id="zone-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Inner north" />
          </div>
          <div className="space-y-2">
            <Label>Ring</Label>
            <Select value={ringId} onValueChange={setRingId}>
              <SelectTrigger><SelectValue placeholder="Choose a ring" /></SelectTrigger>
              <SelectContent>
                {(rings ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name} ({r.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !ringId}>Create zone</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
