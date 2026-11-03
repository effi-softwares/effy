import { useEffect, useState } from "react";

import { useStore } from "@tanstack/react-store";

import { Button } from "@effy/design-system/ui";

import { isRevised, isWorkKey, REVISED_INVITE, shouldOffer, welcomeFirst } from "./engine";
import { useTourContext } from "./TourProvider";

/** How long a loaded page shows before its tour is offered, so the card never flashes in during a navigation. */
const SETTLE_MS = 700;

/**
 * The offer (106 FR-002): a small card in the corner - never over the page's work, never taking focus. Starting work
 * on the page (a click, or a key that types or activates) counts as "Not now"; moving around with Tab does not.
 */
export function TourInvitation() {
  const { tours, byKey, state, store, start, decline } = useTourContext();
  const ui = useStore(store, (s) => ({
    page: s.page,
    busy: s.active !== null || s.pendingStart !== null || s.allToursOpen,
    dismissed: s.dismissed,
  }));

  let offer: { key: string; title: string; invite?: string; revised: boolean } | null = null;
  if (state && !ui.busy && ui.page?.status === "ready") {
    const welcome = welcomeFirst(tours, state);
    const pageTour = byKey.get(ui.page.key);
    const tour = welcome ?? (pageTour && shouldOffer(pageTour, state) ? pageTour : null);
    if (tour && !ui.dismissed.includes(tour.key)) {
      offer = { key: tour.key, title: tour.title, invite: tour.invite, revised: isRevised(tour, state) };
    }
  }

  const offerKey = offer?.key ?? null;
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    setSettled(null);
    if (!offerKey) return;
    const t = window.setTimeout(() => setSettled(offerKey), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [offerKey]);

  const shown = offer !== null && settled === offer.key;

  useEffect(() => {
    if (!shown || !offerKey) return;
    const working = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      return Boolean(el && !el.closest('[data-slot="tour-invitation"]') && el.closest("main"));
    };
    const onPointer = (e: PointerEvent) => {
      if (working(e.target)) decline(offerKey);
    };
    const onKey = (e: KeyboardEvent) => {
      if (isWorkKey(e) && working(e.target)) decline(offerKey);
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [shown, offerKey, decline]);

  if (!shown || !offer) return null;
  const question = offer.revised ? REVISED_INVITE : (offer.invite ?? `Take a quick tour of ${offer.title}?`);

  return (
    <section
      data-slot="tour-invitation"
      aria-label="Tour"
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-40 rounded-lg border bg-popover p-4 text-popover-foreground shadow-md duration-(--dur-standard) animate-in fade-in-0 slide-in-from-bottom-2 sm:left-auto sm:w-90"
    >
      <p className="text-sm font-medium">{question}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => decline(offer.key)}>
          Not now
        </Button>
        <Button onClick={() => start(offer.key, "invitation")}>Take the tour</Button>
      </div>
    </section>
  );
}
