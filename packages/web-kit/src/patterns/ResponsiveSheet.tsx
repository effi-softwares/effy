import type { ReactNode } from "react";
import { XIcon } from "lucide-react";

import { cn } from "@effy/design-system";
import { useIsMobile } from "@effy/design-system/hooks/use-mobile";
import { Button, Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@effy/design-system/ui";

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction={isMobile ? "bottom" : "right"} handleOnly={!isMobile}>
      <DrawerContent
        className={
          isMobile
            ? "data-[vaul-drawer-direction=bottom]:max-h-[92dvh]"
            : cn(
                "data-[vaul-drawer-direction=right]:w-[calc(100%-1rem)]",
                wide ? "data-[vaul-drawer-direction=right]:sm:max-w-140" : "data-[vaul-drawer-direction=right]:sm:max-w-115",
              )
        }
      >
        {isMobile ? <span aria-hidden="true" className="mx-auto mt-3 h-2 w-12 shrink-0 rounded-full bg-muted" /> : null}
        <div className={cn("flex flex-col gap-1", isMobile ? "px-4 pt-3 pb-2" : "px-5 pt-4 pb-3 pr-12")}>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : <DrawerDescription className="sr-only">{title}</DrawerDescription>}
        </div>
        {isMobile ? null : (
          <DrawerClose asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 text-muted-foreground">
              <XIcon aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Button>
          </DrawerClose>
        )}
        <div className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto", isMobile ? "px-4 pt-1 pb-4" : "px-5 pt-1 pb-4")}>{children}</div>
        {footer ? (
          <div
            className={cn(
              "flex gap-2 border-t border-border bg-background",
              isMobile ? "flex-col-reverse px-4 pt-3 pb-5 [&>*]:w-full" : "justify-end px-5 py-3",
            )}
          >
            {footer}
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
