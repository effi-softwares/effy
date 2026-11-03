import { useRef } from "react";

import { CircleHelp } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@effy/design-system/ui";

import { PAGE_NOT_LOADED_HINT } from "./engine";
import { useTourContext, useTours } from "./TourProvider";

/**
 * The one Help place (106 FR-005): replay this page's tour or the Welcome tour, see every tour, and choose whether
 * tours start by themselves on new pages. A tour started here waits for the menu to close before it begins.
 */
export function TourHelpButton() {
  const { state, write } = useTourContext();
  const { page, pageStatus, start, startPage, openAllTours, list } = useTours();
  const tours = list.map((l) => l.tour);
  const welcome = tours.find((t) => t.anyPage);
  const pageHasTour = Boolean(page && tours.some((t) => t.key === page.key));
  const afterClose = useRef<(() => void) | null>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="Help" data-tour="header.help">
          <CircleHelp aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        onCloseAutoFocus={(e) => {
          const run = afterClose.current;
          afterClose.current = null;
          if (run) {
            e.preventDefault();
            run();
          }
        }}
      >
        <DropdownMenuItem disabled={!pageHasTour || pageStatus !== "ready"} onSelect={() => startPage("help")}>
          <span className="flex flex-col">
            Tour this page
            {pageHasTour && pageStatus === "error" ? (
              <span className="text-xs text-muted-foreground">{PAGE_NOT_LOADED_HINT}</span>
            ) : null}
          </span>
        </DropdownMenuItem>
        {welcome ? (
          <DropdownMenuItem onSelect={() => start(welcome.key, "help")}>{welcome.title}</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => (afterClose.current = openAllTours)}>All tours…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={state?.offerTours ?? true}
          disabled={!state}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={(on) => write({ offerTours: on === true })}
        >
          Show tours on new pages
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem disabled={!state} onSelect={() => write({ reset: true })}>
          Show every tour again
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
