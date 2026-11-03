import { Store } from "@tanstack/react-store";

import type { PageStatus } from "./engine";

/** Which tour is running and what is waiting - genuine client state (constitution VI). Server state is the query. */

export type TourVia = "invitation" | "help" | "search" | "all-tours";

export interface TourUiState {
  /** The page on screen and its tour, from `useTourPage`. */
  page: { key: string; status: PageStatus } | null;
  /** The running tour. `index` is the step in the tour's own list; `empty` = every step was skipped. */
  active: { key: string; via: TourVia; index: number; empty: boolean } | null;
  /** A start waiting for its page to be ready and for the menu or dialog that started it to close. */
  pendingStart: { key: string; via: TourVia; since: number } | null;
  allToursOpen: boolean;
  /** Invitations closed in this session, so a failed write never brings one straight back. */
  dismissed: readonly string[];
}

export const INITIAL_TOUR_UI: TourUiState = {
  page: null,
  active: null,
  pendingStart: null,
  allToursOpen: false,
  dismissed: [],
};

export type TourStore = Store<TourUiState>;

export function createTourStore(): TourStore {
  return new Store<TourUiState>(INITIAL_TOUR_UI);
}

export function patchTourUi(store: TourStore, patch: Partial<TourUiState>): void {
  store.setState((s) => ({ ...s, ...patch }));
}
