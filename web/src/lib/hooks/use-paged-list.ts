"use client";

import * as React from "react";
import type { Result } from "@/lib/finance/client";

export type PagedList<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: T[]; next: string | null };

export type FetchPage<F, T> = (
  spaceId: string,
  filters: F,
  cursor?: string,
) => Promise<Result<{ items: T[]; next_cursor?: string | null }>>;

/**
 * A cursor-paginated list with filters, for the finance screens: load, filter, retry, refresh and
 * "Show more". Mount the screen under a key of the space id, so a space switch starts from the
 * defaults. `fetchPage` must be a stable function (a module-level client call).
 *
 * Race guard: `epoch` goes up whenever the list is replaced (new filters, a reload). A "Show more"
 * page that was requested earlier is then dropped instead of being appended to the new list.
 */
export function usePagedList<F, T>(spaceId: string, initialFilters: F, fetchPage: FetchPage<F, T>) {
  const [filters, setFilters] = React.useState<F>(initialFilters);
  const [list, setList] = React.useState<PagedList<T>>({ status: "loading" });
  const [reload, setReload] = React.useState(0);
  const [moreBusy, setMoreBusy] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const epoch = React.useRef(0);

  React.useEffect(() => {
    let live = true;
    fetchPage(spaceId, filters).then((res) => {
      if (!live) return;
      setList(res.ok ? { status: "ready", items: res.data.items, next: res.data.next_cursor ?? null } : { status: "error" });
    });
    return () => {
      live = false;
    };
  }, [spaceId, filters, reload, fetchPage]);

  /** Replaces the filters: the list shows its skeleton until the new list arrives. */
  const applyFilters = React.useCallback((next: F) => {
    epoch.current += 1;
    setList({ status: "loading" });
    setMoreBusy(false);
    setMoreError(false);
    setFilters(next);
  }, []);

  /** Reads the list again with the same filters (after a save or a delete, or Retry). */
  const refresh = React.useCallback(() => {
    epoch.current += 1;
    setList({ status: "loading" });
    setMoreBusy(false);
    setMoreError(false);
    setReload((n) => n + 1);
  }, []);

  async function loadMore() {
    if (list.status !== "ready" || !list.next || moreBusy) return;
    const started = epoch.current;
    setMoreBusy(true);
    setMoreError(false);
    const res = await fetchPage(spaceId, filters, list.next);
    if (started !== epoch.current) return; // the list was replaced meanwhile: this page belongs to the old one
    setMoreBusy(false);
    if (!res.ok) return setMoreError(true);
    setList({ status: "ready", items: [...list.items, ...res.data.items], next: res.data.next_cursor ?? null });
  }

  return { filters, list, applyFilters, refresh, loadMore, moreBusy, moreError };
}
