"use client";

import * as React from "react";
import { Banknote, Check, Pause } from "lucide-react";
import { useFormat } from "@/components/format-provider";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { forMemberText, ListSkeleton, memberName, useReferenceData } from "@/components/finance/finance-parts";
import { RecordCardButton, RecordRowButton } from "@/components/finance/month-groups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { FREQUENCY_LABEL, FREQUENCY_PHRASE } from "@/components/ui/frequency-select";
import { MoneyText } from "@/components/ui/money-text";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { useToast } from "@/components/ui/toast";
import type { SourceResponse } from "@/lib/api";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useListHeading } from "@/lib/hooks/use-list-heading";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { listSources } from "@/lib/income/client";
import { SOURCE_TYPE_LABEL, type SourceType } from "@/lib/income/income";
import { IncomeNav } from "./income-nav";
import { SourceFormDialog } from "./source-form-dialog";

/** The income sources of the active space (finance.md 6.3). Keyed by the space id, so a switch starts again. */
export function SourcesView() {
  const space = useActiveSpace();
  return <SpaceSources key={space.id} spaceId={space.id} household={space.type === "household"} />;
}

type Form = { open: boolean; key: number; source: SourceResponse | null };

const typeLabel = (s: SourceResponse) => SOURCE_TYPE_LABEL[s.type as SourceType] ?? s.type;
const frequencyLabel = (s: SourceResponse) => FREQUENCY_LABEL[s.frequency as keyof typeof FREQUENCY_LABEL] ?? s.frequency;

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-success-subtle text-success">
      <Check aria-hidden="true" />
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      <Pause aria-hidden="true" />
      Paused
    </Badge>
  );
}

/** "EUR 2,850.00 a month", or "EUR 600.00, typical amount" for an irregular source (finance.md 6.3). */
function SourceAmount({ source, inRow }: { source: SourceResponse; inRow?: boolean }) {
const phrase = source.frequency === "irregular" ? "typical amount" : FREQUENCY_PHRASE[source.frequency as keyof typeof FREQUENCY_PHRASE];
  return (
    <span className={inRow ? "inline-flex shrink-0 flex-col items-end whitespace-nowrap text-right" : "inline-flex flex-col items-start whitespace-nowrap"}>
      <MoneyText amount={source.amount} currency={source.currency} size="md" />
      <span className="text-small text-muted-foreground">{phrase}</span>
    </span>
  );
}

function SpaceSources({ spaceId, household }: { spaceId: string; household: boolean }) {
  const toast = useToast();
  const hydrated = useHydrated();
  const { money } = useFormat();
  const ref = useReferenceData(spaceId, household, { categories: false });
  const { list, refresh, loadMore, moreBusy, moreError } = usePagedList(spaceId, undefined, listSources);
  const [form, setForm] = React.useState<Form>({ open: false, key: 0, source: null });
  const { ref: heading } = useListHeading();
  // Set after any save or delete: the row or the empty-state button that opened the dialog may be gone, so when the dialog closes focus goes to the list heading.
  const focusAfterClose = React.useRef(false);
  const finalFocus = React.useCallback(() => {
    if (!focusAfterClose.current) return null;
    focusAfterClose.current = false;
    return heading.current;
  }, [heading]);

  function openForm(source: SourceResponse | null) {
    setForm((f) => ({ open: true, key: f.key + 1, source }));
  }
  const closeForm = () => setForm((f) => ({ ...f, open: false }));

  const items = list.status === "ready" ? list.items : [];
  const empty = list.status === "ready" && items.length === 0;
  const addButton = (
    <Button type="button" disabled={!hydrated} onClick={() => openForm(null)} data-testid="add-source">
      Add a source
    </Button>
  );
  const summary = (s: SourceResponse) =>
    `${s.name}, ${money(s.amount, { currency: s.currency })}, ${s.active ? "active" : "paused"}`;

  return (
    <>
      <AppPageHeader title="Income" description="Money you receive, and where it comes from." primaryAction={empty ? undefined : addButton} />
      <IncomeNav current="sources" />
      <h2 ref={heading} tabIndex={-1} className="sr-only outline-none">
        Your income sources
      </h2>

      <p className="sr-only" role="status" aria-live="polite" data-testid="result-count">
        {list.status === "ready" ? `${items.length} ${items.length === 1 ? "source" : "sources"} shown${list.next ? ", more available" : ""}` : ""}
      </p>

      {list.status === "error" ? (
        <div data-testid="sources-error">
          <FormMessage kind="error">We could not load your income sources just now.</FormMessage>
          <Button type="button" variant="outline" className="mt-3" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : list.status === "loading" ? (
        <ListSkeleton label="Loading income sources" testId="sources-loading" />
      ) : empty ? (
        <EmptyState
          icon={Banknote}
          space="active"
          title="No income sources yet"
          description="Add a salary or a business so you can link the payments you receive."
          primaryAction={{ label: "Add a source", onClick: () => openForm(null) }}
          secondaryAction={{ label: "Record a one-off payment instead", href: "/income?new=1" }}
        />
      ) : (
        <div data-testid="sources-list">
          <ResponsiveList
            label="Income sources"
            rows={items}
            getRowKey={(s) => s.id}
            cardTestId="source-card"
            renderCard={(s) => (
              <RecordCardButton label={summary(s)} onClick={() => openForm(s)}>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block break-words text-body-strong">{s.name}</span>
                    <span className="mt-0.5 block text-small text-muted-foreground">
                      {[typeLabel(s), frequencyLabel(s), forMemberText(ref, household, s.member_user_id) ?? ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <SourceAmount source={s} inRow />
                </span>
                <span className="mt-2 block">
                  <StatusBadge active={s.active} />
                </span>
              </RecordCardButton>
            )}
          />
          <DataTable
            label="Income sources"
            rows={items}
            getRowKey={(s) => s.id}
            rowTestId="source-row"
            columns={[
              {
                id: "name",
                header: "Name",
                cell: (s) => (
                  <div className="min-w-0">
                    <RecordRowButton label={summary(s)} onClick={() => openForm(s)}>
                      {s.name}
                    </RecordRowButton>
                    {/* At md the type and frequency are not columns, so they sit under the name; from xl they have their own. */}
                    <p className="text-small text-muted-foreground xl:hidden">{`${typeLabel(s)} · ${frequencyLabel(s)}`}</p>
                    {household && s.member_user_id ? (
                      <p className="text-small text-muted-foreground">{`For ${memberName(ref, s.member_user_id)}`}</p>
                    ) : null}
                  </div>
                ),
              },
              { id: "type", header: "Type", from: "xl", className: "text-small", cell: (s) => typeLabel(s) },
              { id: "frequency", header: "How often", from: "xl", className: "text-small", cell: (s) => frequencyLabel(s) },
              { id: "amount", header: "Amount", align: "right", cell: (s) => <SourceAmount source={s} inRow /> },
              { id: "status", header: "Status", cell: (s) => <StatusBadge active={s.active} /> },
            ]}
          />
          {list.next ? (
            <div className="mt-4">
              <Button type="button" variant="outline" className="w-full md:w-auto" disabled={moreBusy} aria-busy={moreBusy || undefined} onClick={loadMore} data-testid="load-more">
                {moreBusy ? "Loading…" : "Show more sources"}
              </Button>
            </div>
          ) : null}
          {moreError ? (
            <div className="mt-3">
              <FormMessage kind="error">We could not load more sources just now.</FormMessage>
            </div>
          ) : null}
        </div>
      )}

      <SourceFormDialog
        key={form.key}
        open={form.open}
        onOpenChange={(open) => (open ? setForm((f) => ({ ...f, open: true })) : closeForm())}
        spaceId={spaceId}
        source={form.source}
        reference={ref}
        finalFocus={finalFocus}
        onSaved={() => {
          focusAfterClose.current = true;
          closeForm();
          toast("Source saved.");
          refresh();
        }}
        onDeleted={() => {
          focusAfterClose.current = true;
          closeForm();
          toast("Source deleted.");
          refresh();
        }}
      />
    </>
  );
}
