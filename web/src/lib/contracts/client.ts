import { createBrowserApi, type CategoryResponse, type ContractResponse, type MemberResponse } from "@/lib/api";
import { contractProblem, filtersToQuery, type ContractFilters, type ContractPayload } from "./contracts";
import type { ProblemFields } from "@/lib/profile/problem";
import { NETWORK_MESSAGE } from "@/lib/profile/problem";

/** The outcome of one API call from the browser: data, or a problem the screen can show. */
export type Result<T> = { ok: true; data: T } | { ok: false; problem: ProblemFields };

const networkProblem: ProblemFields = { fields: {}, form: NETWORK_MESSAGE, status: 0 };

async function call<T>(run: (api: Awaited<ReturnType<typeof createBrowserApi>>) => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<Result<T>> {
  try {
    const api = await createBrowserApi();
    const { data, error, response } = await run(api);
    if (response.ok) return { ok: true, data: data as T };
    return { ok: false, problem: contractProblem(response.status, error) };
  } catch {
    return { ok: false, problem: networkProblem };
  }
}

export interface ContractPage {
  items: ContractResponse[];
  next_cursor?: string | null;
}

/** One page of a space's contracts (cursor pagination). */
export function listContracts(spaceId: string, filters: ContractFilters, cursor?: string) {
  return call<ContractPage>((api) =>
    api.GET("/api/v1/spaces/{space_id}/contracts", {
      params: { path: { space_id: spaceId }, query: { ...filtersToQuery(filters), limit: 25, cursor } },
    }),
  );
}

export function getContract(spaceId: string, contractId: string) {
  return call<ContractResponse>((api) =>
    api.GET("/api/v1/spaces/{space_id}/contracts/{contract_id}", {
      params: { path: { space_id: spaceId, contract_id: contractId } },
    }),
  );
}

export function createContract(spaceId: string, body: ContractPayload) {
  return call<ContractResponse>((api) =>
    api.POST("/api/v1/spaces/{space_id}/contracts", { params: { path: { space_id: spaceId } }, body }),
  );
}

export function updateContract(
  spaceId: string,
  contractId: string,
  body: Partial<ContractPayload> & { status?: "active" | "cancelled" },
) {
  return call<ContractResponse>((api) =>
    api.PATCH("/api/v1/spaces/{space_id}/contracts/{contract_id}", {
      params: { path: { space_id: spaceId, contract_id: contractId } },
      body,
    }),
  );
}

export function deleteContract(spaceId: string, contractId: string) {
  return call<undefined>((api) =>
    api.DELETE("/api/v1/spaces/{space_id}/contracts/{contract_id}", {
      params: { path: { space_id: spaceId, contract_id: contractId } },
    }),
  );
}

/** System categories plus the space's own (one page, no cursor). */
export function listCategories(spaceId: string) {
  return call<{ items: CategoryResponse[] }>((api) =>
    api.GET("/api/v1/spaces/{space_id}/categories", { params: { path: { space_id: spaceId } } }),
  );
}

/** Every member of a household, for the "Applies to" pickers (all pages). */
export async function listMembers(spaceId: string): Promise<Result<MemberResponse[]>> {
  const items: MemberResponse[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await call<{ items: MemberResponse[]; next_cursor?: string | null }>((api) =>
      api.GET("/api/v1/spaces/{space_id}/members", { params: { path: { space_id: spaceId }, query: { limit: 100, cursor } } }),
    );
    if (!res.ok) return res;
    items.push(...res.data.items);
    if (!res.data.next_cursor) break;
    cursor = res.data.next_cursor;
  }
  return { ok: true, data: items };
}
