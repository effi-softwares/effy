import { useState } from "react";

import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from "@effy/design-system/ui";

import { deliveryMutationError } from "../errorText";
import { useCreateRing } from "../queries";

// Create a distance ring (047). The furthest ring is open-ended: leave "upper km" blank.
export function NewRingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateRing();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ordinal, setOrdinal] = useState("1");
  const [upperKm, setUpperKm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        code: code.trim(),
        name: name.trim(),
        ordinal: Number(ordinal),
        suggestUpperKm: upperKm.trim() || null,
      });
      setCode(""); setName(""); setOrdinal("1"); setUpperKm("");
      onOpenChange(false);
    } catch (err) {
      setError(deliveryMutationError(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New distance ring</DialogTitle>
          <DialogDescription>
            Rings are ordered by distance (1 = nearest the hub). Leave “upper km” blank for the furthest,
            open-ended ring.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="ring-code">Code</Label>
            <Input id="ring-code" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder="INNER" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ring-name">Name</Label>
            <Input id="ring-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Inner metro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ring-ordinal">Order</Label>
              <Input id="ring-ordinal" type="number" min={1} required value={ordinal} onChange={(e) => setOrdinal(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ring-upper">Upper km (blank = furthest)</Label>
              <Input id="ring-upper" inputMode="decimal" value={upperKm} onChange={(e) => setUpperKm(e.target.value)} placeholder="10" />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>Create ring</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
