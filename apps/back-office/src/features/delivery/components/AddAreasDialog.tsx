import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { LocalityDTO } from "@effy/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@effy/design-system/ui";

import { deliveryMutationError } from "../errorText";
import { localitySearchQuery, postcodeCoverageQuery, useAddPostcodes } from "../queries";
import { PostcodeCoverageNotice } from "./PostcodeCoverageNotice";

/**
 * Add delivery areas by choosing REAL PLACES (031 US1 / FR-001).
 *
 * ── What this replaces, and why ────────────────────────────────────────────────────────────────
 *
 * Until now a zone was composed by typing postcodes into a free-text box that validated their SHAPE
 * and nothing else. That is how **3001** — Melbourne's PO-box code, which has no street addresses —
 * entered Melbourne Metro and sat there undetected. A typo of `3122` for `3121` would have been
 * equally silent, and its only symptom would be deliveries that never happen.
 *
 * `AddPostcodesDialog` is retained as an escape hatch (FR-004) for a place the reference record does
 * not yet know, but it is no longer the primary path.
 *
 * ── ⚠ The disclosure is the point of this dialog ───────────────────────────────────────────────
 *
 * Serviceability is decided by POSTCODE. Choosing "Alfredton" enables all **20** Ballarat localities.
 * `PostcodeCoverageNotice` says so **before the admin confirms** — see FR-006 and the warnings in that
 * component. Without it an admin makes a broad decision believing it was narrow.
 */
export interface AddAreasDialogProps {
  zoneId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddAreasDialog({ zoneId, open, onOpenChange }: AddAreasDialogProps) {
  const addPostcodes = useAddPostcodes(zoneId);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<LocalityDTO | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const results = useQuery(localitySearchQuery(q));
  // ⚠ Fetched as soon as a place is chosen, so the count is on screen at the moment of confirming —
  // not after. A disclosure that arrives late is not a disclosure.
  const coverage = useQuery(postcodeCoverageQuery(selected?.postcode ?? null));

  const reset = () => {
    setQ("");
    setSelected(null);
    setFormError(null);
  };

  const submit = async () => {
    if (!selected) {
      setFormError("Choose a place first.");
      return;
    }
    setFormError(null);
    try {
      await addPostcodes.mutateAsync({ postcodes: [selected.postcode] });
      reset();
      onOpenChange(false);
    } catch (err) {
      setFormError(
        deliveryMutationError(err, "That place already belongs to another delivery zone."),
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add delivery areas</DialogTitle>
          <DialogDescription>
            Search for a suburb. Delivery is decided by postcode, so you will be told exactly which
            places become serviceable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="area-search">Suburb or postcode</Label>
            <Input
              id="area-search"
              value={q}
              autoComplete="off"
              placeholder="Ballarat, or 3350"
              onChange={(e) => {
                setQ(e.target.value);
                setSelected(null);
                setFormError(null);
              }}
              className="mt-1.5"
            />
          </div>

          {/* ⚠ Every option carries name + state + postcode. A bare name identifies nothing in
              Australia — there are six Richmonds and nine Springfields (FR-002). */}
          {results.data && results.data.length > 0 && !selected && (
            <ul
              data-testid="area-results"
              className="max-h-56 overflow-y-auto rounded-md border divide-y"
            >
              {results.data.map((place) => (
                <li key={`${place.name}-${place.state}-${place.postcode}`}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => setSelected(place)}
                  >
                    <span>
                      {place.name} <span className="text-muted-foreground">{place.state}</span>
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {place.postcode}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {results.data && results.data.length === 0 && q.trim().length >= 2 && (
            // ⚠ "We don't know that place" — NOT "we don't deliver there". Different answers.
            <p className="text-sm text-muted-foreground" data-testid="area-no-match">
              No place matches “{q}”. Check the spelling, or use “Add postcodes” for an area we
              don’t recognise yet.
            </p>
          )}

          {selected && (
            <div className="space-y-2" data-testid="area-selected">
              <p className="text-sm">
                <span className="font-medium">
                  {selected.name} {selected.state} {selected.postcode}
                </span>
              </p>
              {/* ⚠ FR-006. On screen, at the moment of confirming. */}
              <PostcodeCoverageNotice coverage={coverage.data} />
            </div>
          )}

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected || addPostcodes.isPending}>
            {addPostcodes.isPending ? "Adding…" : "Add area"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
