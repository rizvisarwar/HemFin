import type { IncomeEntryResponse, SourceResponse } from "@/lib/api";
import { call, listAll } from "@/lib/finance/client";
import { entryFiltersToQuery, type EntryFilters, type EntryPayload, type SourcePayload } from "./income";

export interface EntryPage {
  items: IncomeEntryResponse[];
  next_cursor?: string | null;
}

/** One page of a space's income entries, newest first (cursor pagination). */
export function listEntries(spaceId: string, filters: EntryFilters, cursor?: string) {
  return call<EntryPage>((api) =>
    api.GET("/api/v1/spaces/{space_id}/income-entries", {
      params: { path: { space_id: spaceId }, query: { ...entryFiltersToQuery(filters), limit: 25, cursor } },
    }),
  );
}

export function createEntry(spaceId: string, body: EntryPayload) {
  return call<IncomeEntryResponse>((api) =>
    api.POST("/api/v1/spaces/{space_id}/income-entries", { params: { path: { space_id: spaceId } }, body }),
  );
}

export function updateEntry(spaceId: string, entryId: string, body: EntryPayload) {
  return call<IncomeEntryResponse>((api) =>
    api.PATCH("/api/v1/spaces/{space_id}/income-entries/{entry_id}", {
      params: { path: { space_id: spaceId, entry_id: entryId } },
      body,
    }),
  );
}

export function deleteEntry(spaceId: string, entryId: string) {
  return call<undefined>((api) =>
    api.DELETE("/api/v1/spaces/{space_id}/income-entries/{entry_id}", {
      params: { path: { space_id: spaceId, entry_id: entryId } },
    }),
  );
}

/** One page of a space's income sources (cursor pagination). */
export function listSources(spaceId: string, _filters: null, cursor?: string) {
  return call<{ items: SourceResponse[]; next_cursor?: string | null }>((api) =>
    api.GET("/api/v1/spaces/{space_id}/income-sources", { params: { path: { space_id: spaceId }, query: { limit: 25, cursor } } }),
  );
}

/** Every income source of a space (all pages): there are few, and the entries need their names. */
export function listAllSources(spaceId: string) {
  return listAll((cursor) =>
    call<{ items: SourceResponse[]; next_cursor?: string | null }>((api) =>
      api.GET("/api/v1/spaces/{space_id}/income-sources", { params: { path: { space_id: spaceId }, query: { limit: 100, cursor } } }),
    ),
  );
}

export function createSource(spaceId: string, body: SourcePayload) {
  return call<SourceResponse>((api) =>
    api.POST("/api/v1/spaces/{space_id}/income-sources", { params: { path: { space_id: spaceId } }, body }),
  );
}

export function updateSource(spaceId: string, sourceId: string, body: SourcePayload) {
  return call<SourceResponse>((api) =>
    api.PATCH("/api/v1/spaces/{space_id}/income-sources/{source_id}", {
      params: { path: { space_id: spaceId, source_id: sourceId } },
      body,
    }),
  );
}

export function deleteSource(spaceId: string, sourceId: string) {
  return call<undefined>((api) =>
    api.DELETE("/api/v1/spaces/{space_id}/income-sources/{source_id}", {
      params: { path: { space_id: spaceId, source_id: sourceId } },
    }),
  );
}
