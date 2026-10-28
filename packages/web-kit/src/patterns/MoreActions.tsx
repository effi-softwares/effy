import { useRef, useState } from "react";

import { Link, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@effy/design-system";
import { useIsMobile } from "@effy/design-system/hooks/use-mobile";
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@effy/design-system/ui";

/** One action that lives behind "More": it runs `onSelect`, or follows `link`. */
export interface MoreAction {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  link?: LinkProps;
  disabled?: boolean;
  /** Why it is disabled, said beside it. */
  hint?: string;
  /** Deletes or takes something away: last in the list, after a rule, in the destructive colour. */
  destructive?: boolean;
}

/**
 * The page's other actions, behind one "More" button, so a page head shows at most one primary and one
 * outline button. A dropdown with a pointer (its rows grow to 44px on a touch screen); a bottom sheet of
 * full-width rows on a phone, where a small menu is hard to hit. An action that opens a dialog runs once
 * the menu has closed, so the two overlays never fight over focus.
 */
export function MoreActions({
  actions,
  label = "More actions",
}: {
  actions: readonly (MoreAction | false | null | undefined)[];
  label?: string;
}) {
  const shown = actions.filter((a): a is MoreAction => Boolean(a));
  const ordered = [...shown.filter((a) => !a.destructive), ...shown.filter((a) => a.destructive)];
  const firstDestructive = ordered.findIndex((a) => a.destructive);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  if (ordered.length === 0) return null;

  const choose = (a: MoreAction) => {
    if (a.disabled) return;
    if (a.onSelect) pending.current = a.onSelect;
    setOpen(false);
  };
  const runPending = () => {
    const run = pending.current;
    pending.current = null;
    run?.();
  };

  const trigger = (onClick?: () => void) => (
    <Button variant="outline" size="icon" aria-label={label} title={label} onClick={onClick}>
      <MoreHorizontal aria-hidden="true" />
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} onAnimationEnd={(o) => !o && runPending()}>
        {trigger(() => setOpen(true))}
        <DrawerContent className="px-2 pb-[calc(8px+env(safe-area-inset-bottom))]">
          <span aria-hidden="true" className="mx-auto mt-3 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-muted" />
          <DrawerTitle className="sr-only">{label}</DrawerTitle>
          <DrawerDescription className="sr-only">Choose what to do.</DrawerDescription>
          <ul className="flex flex-col py-1">
            {ordered.map((a, i) => {
              const body = (
                <>
                  {a.icon ? <a.icon aria-hidden="true" className={cn(!a.destructive && "text-muted-foreground")} /> : null}
                  <span className="min-w-0 flex-1 text-left">
                    {a.label}
                    {a.disabled && a.hint ? (
                      <span className="block text-xs font-normal text-muted-foreground">{a.hint}</span>
                    ) : null}
                  </span>
                </>
              );
              const cls = cn(
                "h-auto min-h-12 w-full justify-start gap-3 px-3 py-2 text-base font-normal whitespace-normal",
                a.destructive && "text-destructive hover:text-destructive",
              );
              return (
                <li key={a.label} className={cn(i === firstDestructive && i > 0 && "mt-1 border-t pt-1")}>
                  {a.link ? (
                    <Button asChild variant="ghost" className={cls}>
                      <Link {...a.link} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="ghost" className={cls} disabled={a.disabled} onClick={() => choose(a)}>
                      {body}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger()}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-56"
        onCloseAutoFocus={(e) => {
          if (!pending.current) return;
          e.preventDefault();
          runPending();
        }}
      >
        {ordered.map((a, i) => (
          <div key={a.label}>
            {i === firstDestructive && i > 0 ? <DropdownMenuSeparator /> : null}
            {a.link ? (
              <DropdownMenuItem asChild disabled={a.disabled}>
                <Link {...a.link}>
                  {a.icon ? <a.icon aria-hidden="true" /> : null}
                  {a.label}
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant={a.destructive ? "destructive" : "default"}
                disabled={a.disabled}
                title={a.disabled ? a.hint : undefined}
                onSelect={() => choose(a)}
              >
                {a.icon ? <a.icon aria-hidden="true" /> : null}
                {a.label}
              </DropdownMenuItem>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
