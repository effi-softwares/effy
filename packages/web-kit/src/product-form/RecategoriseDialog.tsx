import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@effy/design-system/ui";

/** Moving a product to a category that does not ask for some of its details: they are dropped. */
export function RecategoriseDialog({
  toPath,
  dropped,
  onConfirm,
  onCancel,
}: {
  toPath: string;
  dropped: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move to {toPath}?</AlertDialogTitle>
          <AlertDialogDescription>
            That category doesn't ask for{" "}
            {dropped.length === 1 ? "this detail" : "these details"}, so{" "}
            {dropped.length === 1 ? "it is" : "they are"} removed:{" "}
            {dropped.join(", ")}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep the current category</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Move and remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
