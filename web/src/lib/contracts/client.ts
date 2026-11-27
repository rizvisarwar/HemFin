import type { ContractResponse } from "@/lib/api";
import { call, listAll } from "@/lib/finance/client";
import { filtersToQuery, type ContractFilters, type ContractPayload } from "./contracts";

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

/** Every contract of a space, active or cancelled, for the expense form's picker and the names on expense rows. */
export function listAllContracts(spaceId: string) {
  return listAll((cursor) =>
    call<ContractPage>((api) =>
      api.GET("/api/v1/spaces/{space_id}/contracts", { params: { path: { space_id: spaceId }, query: { limit: 100, cursor } } }),
    ),
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
