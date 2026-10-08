import { useState } from "react";

import type { CoveragePostcodeDTO } from "@effy/shared-types";
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from "@effy/design-system/ui";

import { coverageError } from "../errorText";
import { usePatchCoveragePostcodes } from "../queries";

/**
 * One postcode's distance from the hub (076 US6).
 *
 * The platform works it out from the place's location and recalculates it when the hub moves. A
 * person may enter it instead — it is then theirs: never recalculated, and flagged for another look
 * when the hub moves. It can be handed back to the platform where a location is known.
 */
export function DistanceDialog({ postcode, onClose }: { postcode: CoveragePostcodeDTO; onClose: () => void }) {
  const patch = usePatchCoveragePostcodes();
  const [km, setKm] = useState(postcode.distanceKm);
  const [error, setError] = useState<string | null>(null);

  async function save(change: { source: "manual"; km: string } | { source: "computed" }) {
    setError(null);
    try {
      await patch.mutateAsync({ postcodes: [postcode.postcode], distance: change });
      onClose();
    } catch (err) {
      setError(coverageError(err));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Distance to {postcode.postcode}</DialogTitle>
          <DialogDescription>
            {postcode.places.slice(0, 3).join(", ")} — currently {postcode.distanceKm} km,{" "}
            {postcode.distanceSource === "manual" ? "entered by hand" : "worked out from its location"}.
            {postcode.needsReview ? " The hub has moved since it was entered — check it is still right." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="distance-km">Distance from the hub (km, straight line)</Label>
          <Input id="distance-km" className="w-32" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          {postcode.distanceSource === "manual" ? (
            <Button variant="outline" disabled={patch.isPending} onClick={() => void save({ source: "computed" })}>Work it out instead</Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={patch.isPending || km.trim() === ""} onClick={() => void save({ source: "manual", km: km.trim() })}>Save distance</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
