import { createBrowserApi, type CategoryResponse, type MemberResponse } from "@/lib/api";
import { NETWORK_MESSAGE, type ProblemFields } from "@/lib/profile/problem";
import { financeProblem } from "./problem";

/** The outcome of one API call from the browser: data, or a problem the screen can show. */
export type Result<T> = { ok: true; data: T } | { ok: false; problem: ProblemFields };

const networkProblem: ProblemFields = { fields: {}, form: NETWORK_MESSAGE, status: 0 };

type BrowserApi = Awaited<ReturnType<typeof createBrowserApi>>;

/** Runs one call with the browser client and turns every outcome into a `Result`. Shared by the finance clients. */
export async function call<T>(
  run: (api: BrowserApi) => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<Result<T>> {
  try {
    const api = await createBrowserApi();
    const { data, error, response } = await run(api);
    if (response.ok) return { ok: true, data: data as T };
    return { ok: false, problem: financeProblem(response.status, error) };
  } catch {
    return { ok: false, problem: networkProblem };
  }
}

/** Reads every page of a cursor-paginated list (up to 10 pages of 100), for pickers that need the whole set. */
export async function listAll<T>(
  page: (cursor: string | undefined) => Promise<Result<{ items: T[]; next_cursor?: string | null }>>,
): Promise<Result<T[]>> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let n = 0; n < 10; n++) {
    const res = await page(cursor);
    if (!res.ok) return res;
    items.push(...res.data.items);
    if (!res.data.next_cursor) break;
    cursor = res.data.next_cursor;
  }
  return { ok: true, data: items };
}

/** System categories plus the space's own (one page, no cursor). */
export function listCategories(spaceId: string) {
  return call<{ items: CategoryResponse[] }>((api) =>
    api.GET("/api/v1/spaces/{space_id}/categories", { params: { path: { space_id: spaceId } } }),
  );
}

/** Every member of a household, for the "Applies to" pickers (all pages). */
export function listMembers(spaceId: string): Promise<Result<MemberResponse[]>> {
  return listAll((cursor) =>
    call<{ items: MemberResponse[]; next_cursor?: string | null }>((api) =>
      api.GET("/api/v1/spaces/{space_id}/members", { params: { path: { space_id: spaceId }, query: { limit: 100, cursor } } }),
    ),
  );
}
