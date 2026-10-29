import { History } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import type { MoreAction } from "../patterns/MoreActions";
import { useActivityLog } from "./search";

/**
 * How a page opens its activity drawer (104) when it has no "More" menu: an outline button beside the page's
 * other actions. A page WITH a More menu adds `useActivityAction()` to it instead.
 */
export function ActivityButton() {
  const { show } = useActivityLog();
  return (
    <Button variant="outline" onClick={() => show()}>
      <History aria-hidden="true" />
      Activity
    </Button>
  );
}

/** The page's More menu entry that opens its activity drawer; first in the menu. */
export function useActivityAction(): MoreAction {
  const { show } = useActivityLog();
  return { label: "Activity", icon: History, onSelect: () => show() };
}
