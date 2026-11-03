import { useEffect } from "react";

import type { PageStatus } from "./engine";
import { patchTourUi } from "./store";
import { useOptionalTourContext } from "./TourProvider";

/**
 * Every routed console screen says which tour is its own and whether it has loaded (106 research R6). Only a
 * `ready` page offers or runs a tour; pass `status: tourStatus(mainQuery)`.
 */
export function useTourPage(key: string, { status }: { status: PageStatus }): void {
  // Outside a TourProvider (a test, a preview) there is nothing to register with.
  const store = useOptionalTourContext()?.store;
  useEffect(() => {
    if (store) patchTourUi(store, { page: { key, status } });
  }, [key, status, store]);
  useEffect(
    () => () => {
      if (store && store.state.page?.key === key) patchTourUi(store, { page: null });
    },
    [key, store],
  );
}
