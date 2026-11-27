import type { ExpenseResponse } from "@/lib/api";
import { call } from "@/lib/finance/client";
import { expenseFiltersToQuery, type ExpenseFilters, type ExpensePayload } from "./expenses";

export interface ExpensePage {
  items: ExpenseResponse[];
  next_cursor?: string | null;
}

/** One page of a space's expenses, newest first (cursor pagination). */
export function listExpenses(spaceId: string, filters: ExpenseFilters, cursor?: string) {
  return call<ExpensePage>((api) =>
    api.GET("/api/v1/spaces/{space_id}/expenses", {
      params: { path: { space_id: spaceId }, query: { ...expenseFiltersToQuery(filters), limit: 25, cursor } },
    }),
  );
}

export function createExpense(spaceId: string, body: ExpensePayload) {
  return call<ExpenseResponse>((api) =>
    api.POST("/api/v1/spaces/{space_id}/expenses", { params: { path: { space_id: spaceId } }, body }),
  );
}

export function updateExpense(spaceId: string, expenseId: string, body: ExpensePayload) {
  return call<ExpenseResponse>((api) =>
    api.PATCH("/api/v1/spaces/{space_id}/expenses/{expense_id}", {
      params: { path: { space_id: spaceId, expense_id: expenseId } },
      body,
    }),
  );
}

export function deleteExpense(spaceId: string, expenseId: string) {
  return call<undefined>((api) =>
    api.DELETE("/api/v1/spaces/{space_id}/expenses/{expense_id}", {
      params: { path: { space_id: spaceId, expense_id: expenseId } },
    }),
  );
}
