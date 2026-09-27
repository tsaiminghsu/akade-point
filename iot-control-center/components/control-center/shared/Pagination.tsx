"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export const DEFAULT_PAGE_SIZE = 20;

export interface Pagination<T> {
  /** Current page, already clamped to the available range — a filter change that
   *  shrinks the list can't leave the view stranded on an empty page. */
  page: number;
  setPage: (next: number) => void;
  totalPages: number;
  pageItems: T[];
  from: number;
  to: number;
  total: number;
}

/** Shared client-side paging for the Control Center lists. */
export function usePagination<T>(items: T[], pageSize: number = DEFAULT_PAGE_SIZE): Pagination<T> {
  const [page, setPage] = useState(0);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(page, totalPages - 1);
  const pageItems = useMemo(
    () => items.slice(clamped * pageSize, clamped * pageSize + pageSize),
    [items, clamped, pageSize]
  );

  return {
    page: clamped,
    setPage,
    totalPages,
    pageItems,
    from: total === 0 ? 0 : clamped * pageSize + 1,
    to: Math.min(total, (clamped + 1) * pageSize),
    total,
  };
}

/** The "Showing 1–20 of 57" footer with prev/next controls. */
export function PaginationBar<T>({ pagination, className }: { pagination: Pagination<T>; className?: string }) {
  const t = useTranslations("Common");
  const { page, setPage, totalPages, from, to, total } = pagination;

  return (
    <div className={className ?? "mt-3 flex items-center justify-between text-xs text-muted-foreground"}>
      <span>{t("showing", { from, to, total })}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("previousPage")}
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
        </Button>
        <span>{t("page", { page: page + 1, totalPages })}</span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("nextPage")}
          onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
        >
          <ChevronRight aria-hidden className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
