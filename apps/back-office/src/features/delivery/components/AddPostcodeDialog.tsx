import { useState } from "react";

import type { PostcodeCheckDTO } from "@effy/shared-types";
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from "@effy/design-system/ui";

import { deliveryMutationError, POSTCODE_IN_ZONE } from "../errorText";
import { checkPostcode } from "../repo";
import { useAddPostcode } from "../queries";

// Add a postcode to a zone by place (047 FR-008/009/010). "Check" runs the disclosure — every OTHER place
// the postcode also makes serviceable, whether it is unknown, and whether another zone already holds it —
// BEFORE the operator commits. An unknown postcode requires an explicit confirm.
export function AddPostcodeDialog({
  zoneId, zoneName, open, onOpenChange,
}: { zoneId: string; zoneName: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const add = useAddPostcode();
  const [postcode, setPostcode] = useState("");
  const [check, setCheck] = useState<PostcodeCheckDTO | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPostcode(""); setCheck(null); setError(null);
  }

  async function runCheck() {
    setError(null); setCheck(null); setChecking(true);
    try {
      setCheck(await checkPostcode(postcode.trim()));
    } catch (err) {
      setError(deliveryMutationError(err));
    } finally {
      setChecking(false);
    }
  }

  async function add_(confirm: boolean) {
    setError(null);
    try {
      await add.mutateAsync({ zoneId, postcode: postcode.trim(), confirm });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(deliveryMutationError(err, POSTCODE_IN_ZONE));
    }
  }

  const taken = check?.inZoneCode != null;
  const unknown = check?.unknownPostcode === true;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a postcode to {zoneName}</DialogTitle>
          <DialogDescription>
            Serviceability is decided by postcode — adding one makes every place sharing it serviceable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="pc">Postcode</Label>
              <Input id="pc" inputMode="numeric" value={postcode}
                onChange={(e) => { setPostcode(e.target.value); setCheck(null); }} placeholder="3121" />
            </div>
            <Button type="button" variant="outline" disabled={checking || postcode.trim().length < 4} onClick={runCheck}>
              Check
            </Button>
          </div>

          {check ? (
            <div className="rounded-md border p-3 text-sm">
              {taken ? (
                <p className="text-destructive">
                  {postcode.trim()} already belongs to zone <span className="font-mono">{check.inZoneCode}</span>.
                </p>
              ) : unknown ? (
                <p className="text-muted-foreground">
                  ⚠ {postcode.trim()} matches no known place. You can still add it, but confirm you meant to.
                </p>
              ) : (
                <>
                  <p className="font-medium">
                    Adding {postcode.trim()} makes {check.placeCount} place{check.placeCount === 1 ? "" : "s"} serviceable:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {check.places.map((p) => (
                      <li key={`${p.name}-${p.state}`}>{p.name}, {p.state}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="button"
            disabled={add.isPending || !check || taken}
            onClick={() => void add_(unknown)}
          >
            {unknown ? "Add anyway" : "Add postcode"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
