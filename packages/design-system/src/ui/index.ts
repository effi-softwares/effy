/**
 * shadcn/ui primitives (new-york, Radix base) — the platform's ONE set.
 *
 * These lived in `apps/back-office/src/components/ui/` until 007-shop-web needed them too.
 * Constitution Principle V says one design-system package drives every surface; leaving a
 * second copy in the second app would have made that sentence false.
 *
 * Consumers point `components.json` → `aliases.ui` at `@effy/design-system/ui`, so the shadcn
 * CLI keeps generating correct imports.
 */
export * from "./alert-dialog";
export * from "./avatar";
export * from "./badge";
export * from "./breadcrumb";
export * from "./button";
export * from "./card";
export * from "./checkbox";
export * from "./collapsible";
export * from "./dialog";
export * from "./dropdown-menu";
export * from "./input";
export * from "./label";
export * from "./popover";
export * from "./radio-group";
export * from "./select";
export * from "./separator";
export * from "./sheet";
export * from "./sidebar";
export * from "./skeleton";
export * from "./sonner";
export * from "./switch";
export * from "./table";
export * from "./tabs";
export * from "./textarea";
export * from "./tooltip";
