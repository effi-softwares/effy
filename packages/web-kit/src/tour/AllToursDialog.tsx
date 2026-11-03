import { useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@effy/design-system/ui";

import type { TourDef } from "./define";
import { patchTourUi } from "./store";
import { useTourContext, useTours, type TourListItem } from "./TourProvider";

const SEEN_WORD: Record<TourListItem["seen"], string> = { new: "New", seen: "Seen", updated: "Updated" };

/**
 * Every tour in the console (106 FR-005, FR-007). Starting one for another page opens that page first - for an order
 * or a product, the newest one - and the tour begins once the page has loaded and this dialog has closed.
 */
export function AllToursDialog() {
  const { store, openRecord } = useTourContext();
  const { list, page, start } = useTours();
  const open = useStore(store, (s) => s.allToursOpen);
  const navigate = useNavigate();

  async function run(tour: TourDef) {
    patchTourUi(store, { allToursOpen: false });
    if (!tour.anyPage && page?.key !== tour.key) {
      if (tour.needsRecord) {
        if (!(await openRecord(tour.needsRecord))) return;
      } else if (tour.path) {
        await navigate({ to: tour.path as never, search: (tour.search ?? {}) as never });
      }
    }
    start(tour.key, "all-tours");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => patchTourUi(store, { allToursOpen: next })}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>All tours</DialogTitle>
          <DialogDescription>A short walk through each page. Start any of them, as often as you like.</DialogDescription>
        </DialogHeader>
        <ul className="-mx-1 max-h-[60vh] divide-y overflow-y-auto">
          {list.map(({ tour, seen }) => (
            <li key={tour.key} className="flex items-center gap-3 px-1 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{tour.title}</span>
              <span className="text-xs text-muted-foreground">{SEEN_WORD[seen]}</span>
              <Button variant="outline" size="sm" onClick={() => void run(tour)}>
                Start
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
