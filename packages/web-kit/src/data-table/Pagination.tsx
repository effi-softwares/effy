import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { LIST_PAGE_SIZES, type ListPage, type ListPageSize } from "@effy/shared-types";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";

const count = new Intl.NumberFormat("en-AU");

/** "1–25 of 312", "1–25 of 10,000+", "No results". */
export function rangeText(page: Pick<ListPage<unknown>, "items" | "total" | "totalCapped" | "pageSize">, pageNumber: number): string {
  if (page.items.length === 0) return "No results";
  const from = (pageNumber - 1) * page.pageSize + 1;
  const to = from + page.items.length - 1;
  return `${count.format(from)}–${count.format(to)} of ${count.format(page.total)}${page.totalCapped ? "+" : ""}`;
}

/** Whether there is a page before and after this one: the pager's buttons and scroll paging ask the same. */
export function pageMoves(page: ListPage<unknown> | undefined, pageNumber: number) {
  const offset = page?.page != null;
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : null;
  return {
    offset,
    pages,
    canBack: pageNumber > 1,
    // A cursor list knows its next page by its cursor, whatever its (capped) count says.
    canNext: page ? (offset ? pages !== null && pageNumber < pages : page.nextCursor !== null) : false,
    // Only a numbered list can jump to its end; a cursor list reaches it page by page.
    canLast: offset && pages !== null && !page?.totalCapped && pageNumber < pages,
  };
}

/**
 * The list's footer (103 FR-002), one look for every list: what is on screen, rows per page, "Page n of m" and
 * first / previous / next / last. A cursor list's count may be capped ("of 400+"), and its last button stays off.
 */

export function Pagination({
  page,
  pageNumber,
  size,
  onSize,
  onFirst,
  onBack,
  onNext,
  onLast,
}: {
  page: ListPage<unknown> | undefined;
  /** The page shown (the URL's; for keyset lists, the position in the stack). */
  pageNumber: number;
  size: ListPageSize;
  onSize: (size: ListPageSize) => void;
  onFirst: () => void;
  onBack: () => void;
  onNext: () => void;
  onLast?: (lastPage: number) => void;
}) {
  const { pages, canBack, canNext, canLast } = pageMoves(page, pageNumber);

  return (
    <div className="ef-dt-pager flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-2.5 text-sm text-muted-foreground">
      <span aria-live="polite">{page ? rangeText(page, pageNumber) : " "}</span>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 max-md:hidden">
          Rows
          <Select value={String(size)} onValueChange={(v) => onSize(Number(v) as ListPageSize)}>
            <SelectTrigger size="sm" aria-label="Rows per page" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIST_PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pages !== null ? (
          <span className="whitespace-nowrap max-sm:hidden">
            Page {count.format(pageNumber)} of {count.format(pages)}
            {page?.totalCapped ? "+" : ""}
          </span>
        ) : null}
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label="First page" disabled={!canBack} onClick={onFirst}>
            <ChevronsLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={!canBack} onClick={onBack}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!canNext} onClick={onNext}>
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            disabled={!canLast || !onLast}
            title={page && !canLast && canNext ? "This list is read page by page" : undefined}
            onClick={() => pages !== null && onLast?.(pages)}
          >
            <ChevronsRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
