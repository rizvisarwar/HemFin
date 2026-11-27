"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Ellipsis } from "lucide-react";
import { useFormat } from "@/components/format-provider";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useActiveSpace } from "@/components/layout/app-shell-client";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import type { ContractResponse } from "@/lib/api";
import { deleteContract, getContract, updateContract } from "@/lib/contracts/client";
import { noticeChip, noticePassed, paymentChip, renewalChip } from "@/lib/contracts/contracts";
import { ConfirmDialog } from "./confirm-dialog";
import { ContractFormDialog } from "./contract-form-dialog";
import { categoryName, ContractAmount, memberLabel, SoonChips, useReferenceData, useToday } from "./contract-parts";

type Load = { status: "loading" } | { status: "not-found" } | { status: "error" } | { status: "ready"; contract: ContractResponse };

/** One contract of the active space (finance.md 4.2). Switching space leaves the page: the id belongs to the old space. */
export function ContractDetailView({ id }: { id: string }) {
  const space = useActiveSpace();
  const router = useRouter();
  const [spaceId] = React.useState(space.id);
  React.useEffect(() => {
    if (space.id !== spaceId) router.replace("/contracts");
  }, [space.id, spaceId, router]);
  return <Detail id={id} spaceId={spaceId} household={space.type === "household"} />;
}

function Detail({ id, spaceId, household }: { id: string; spaceId: string; household: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const hydrated = useHydrated();
  const today = useToday();
  const { calendarDate } = useFormat();
  const ref = useReferenceData(spaceId, household);

  const [load, setLoad] = React.useState<Load>({ status: "loading" });
  const [reload, setReload] = React.useState(0);
  const [message, setMessage] = React.useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [ask, setAsk] = React.useState<"cancel" | "delete" | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editKey, setEditKey] = React.useState(0);
  const [reactivating, setReactivating] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    getContract(spaceId, id).then((res) => {
      if (!live) return;
      if (res.ok) setLoad({ status: "ready", contract: res.data });
      else setLoad({ status: res.problem.status === 404 || res.problem.status === 422 ? "not-found" : "error" });
    });
    return () => {
      live = false;
    };
  }, [spaceId, id, reload]);

  if (load.status === "loading") {
    return (
      <div aria-busy="true" data-testid="contract-loading">
        <p className="sr-only" role="status">
          Loading contract
        </p>
        <Skeleton className="mb-4 h-9 w-56" />
        <div className="grid gap-4 md:max-w-xl xl:max-w-none xl:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }
  if (load.status === "not-found") {
    return (
      <div data-testid="contract-not-found">
        <h1 className="text-h1">We could not find this contract.</h1>
        <p className="mt-2 text-body text-muted-foreground">It may have been deleted, or it belongs to another space.</p>
        <Link href="/contracts" className={cn(buttonVariants(), "mt-6")}>
          Back to contracts
        </Link>
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div data-testid="contract-error">
        <FormMessage kind="error">We could not load this contract just now.</FormMessage>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => {
            setLoad({ status: "loading" });
            setReload((n) => n + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const c = load.contract;
  const s = c.schedule;
  const cancelled = c.status === "cancelled";
  const category = categoryName(ref.categories, c.category);
  const appliesTo = c.member_user_id
    ? memberLabel(ref.members.find((m) => m.user_id === c.member_user_id) ?? { display_name: null })
    : "Whole household";

  async function setStatus(status: "active" | "cancelled"): Promise<string | undefined> {
    const res = await updateContract(spaceId, id, { status });
    if (!res.ok) return res.problem.form ?? "We could not update this contract. Try again.";
    setLoad({ status: "ready", contract: res.data });
    setMessage({ kind: "success", text: status === "cancelled" ? "Contract marked as cancelled." : "Contract is active again." });
    return undefined;
  }

  async function makeActive() {
    setReactivating(true);
    setMessage(null);
    const error = await setStatus("active");
    setReactivating(false);
    if (error) setMessage({ kind: "error", text: error });
  }

  return (
    <>
      <AppPageHeader
        title={c.name}
        description={[c.provider, category].filter(Boolean).join(" · ")}
        backLink={{ label: "Contracts", href: "/contracts" }}
        breadcrumbs={[{ label: "Contracts", href: "/contracts" }, { label: c.name }]}
        primaryAction={
          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1 md:flex-none"
              disabled={!hydrated}
              onClick={() => {
                setEditKey((n) => n + 1);
                setEditOpen(true);
              }}
            >
              Edit contract
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="outline" size="icon" aria-label="More actions" disabled={!hydrated} className="shrink-0 md:w-11" />}
              >
                <Ellipsis aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {cancelled ? (
                  <DropdownMenuItem className="min-h-11 px-3 text-base" disabled={reactivating} onClick={makeActive}>
                    {reactivating ? "Making active…" : "Make active again"}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="min-h-11 px-3 text-base" onClick={() => setAsk("cancel")}>
                    Mark as cancelled
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="min-h-11 px-3 text-base" onClick={() => setAsk("delete")}>
                  Delete contract
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
      {cancelled ? (
        <Badge variant="outline" className="mb-4" data-testid="cancelled-badge">
          Cancelled
        </Badge>
      ) : null}
      <div className={message ? "mb-4" : undefined}>
        <FormMessage kind={message?.kind ?? "success"}>{message?.text}</FormMessage>
      </div>

      <div className="grid gap-4 md:max-w-xl xl:max-w-none xl:grid-cols-2 xl:items-start">
        <HemCard data-testid="schedule-card" aria-labelledby="schedule-heading" role="region">
          <h2 id="schedule-heading" className="text-h3">
            Schedule
          </h2>
          <dl className="mt-2">
            <Row label="Next payment">
              {cancelled ? (
                "No payments due, cancelled"
              ) : s.next_payment_date ? (
                <>
                  <span>{calendarDate(s.next_payment_date)}</span>
                  <SoonChips chips={[paymentChip(s.next_payment_date, today)]} className="mt-1 md:justify-end" />
                </>
              ) : c.end_date ? (
                `Ended on ${calendarDate(c.end_date)}`
              ) : (
                "No payments due"
              )}
            </Row>
            <Row label="Renews">
              {s.renewal_date ? (
                <>
                  <span>{calendarDate(s.renewal_date)}</span>
                  <SoonChips chips={[renewalChip(s.renewal_date, today)]} className="mt-1 md:justify-end" />
                </>
              ) : (
                "No renewal date"
              )}
            </Row>
            <Row label="Notice deadline">
              {s.notice_deadline && noticePassed(s.notice_deadline, today) ? (
                `Notice period passed on ${calendarDate(s.notice_deadline)}.${s.renewal_date ? ` It renews on ${calendarDate(s.renewal_date)}.` : ""}`
              ) : s.notice_deadline ? (
                <>
                  <span>{calendarDate(s.notice_deadline)}</span>
                  <SoonChips chips={[noticeChip(s.notice_deadline, today)]} className="mt-1 md:justify-end" />
                </>
              ) : c.notice_period_days === null ? (
                "No notice period set"
              ) : (
                "No notice deadline"
              )}
            </Row>
          </dl>
          {c.notice_period_days !== null ? (
            <p className="mt-3 text-small text-muted-foreground">Notice period: {c.notice_period_days} days before renewal</p>
          ) : null}
        </HemCard>

        <HemCard data-testid="details-card" aria-labelledby="details-heading" role="region">
          <h2 id="details-heading" className="text-h3">
            Details
          </h2>
          <dl className="mt-2">
            <Row label="Amount">
              <ContractAmount contract={c} />
            </Row>
            <Row label="Starts">{calendarDate(c.start_date)}</Row>
            <Row label="Ends">{c.end_date ? calendarDate(c.end_date) : "No end date"}</Row>
            <Row label="Renews">
              {c.auto_renew ? `Automatically, every ${c.renewal_term_months ?? 12} months` : "Does not renew automatically"}
            </Row>
            {household ? <Row label="Applies to">{appliesTo}</Row> : null}
            {c.notes ? <Row label="Notes">{<span className="whitespace-pre-wrap">{c.notes}</span>}</Row> : null}
          </dl>
        </HemCard>
      </div>

      <Link
        href={`/expenses?contract_id=${c.id}`}
        className="mt-4 inline-flex min-h-11 items-center gap-1 text-body font-medium text-primary underline-offset-4 hover:underline"
      >
        Expenses for this contract
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>

      <ContractFormDialog
        key={editKey}
        open={editOpen}
        onOpenChange={setEditOpen}
        spaceId={spaceId}
        contract={c}
        referenceStatus={ref.status}
        onRetryReference={ref.retry}
        categories={ref.categories}
        members={ref.members}
        onSaved={(saved) => {
          setLoad({ status: "ready", contract: saved });
          setEditOpen(false);
          setMessage(null);
          toast("Contract saved");
        }}
      />

      {ask === "cancel" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => (open ? undefined : setAsk(null))}
          title={`Mark ${c.name} as cancelled?`}
          description="It stops showing payments and renewals. Its expenses stay in your list. You can make it active again from its page."
          confirmLabel="Mark as cancelled"
          busyLabel="Saving…"
          dismissLabel="Keep contract"
          onConfirm={async () => {
            const error = await setStatus("cancelled");
            if (!error) setAsk(null);
            return error;
          }}
        />
      ) : null}
      {ask === "delete" ? (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(open) => (open ? undefined : setAsk(null))}
          title={`Delete ${c.name}?`}
          description="This removes the contract and its schedule. Expenses linked to it stay in your list, without the link."
          confirmLabel="Delete contract"
          busyLabel="Deleting…"
          dismissLabel="Keep contract"
          onConfirm={async () => {
            const res = await deleteContract(spaceId, id);
            if (!res.ok) return res.problem.form ?? "We could not delete this contract. Try again.";
            toast("Contract deleted");
            router.push("/contracts");
            return undefined;
          }}
        />
      ) : null}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 md:flex-row md:justify-between md:gap-4">
      <dt className="shrink-0 text-small text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-body md:text-right">{children}</dd>
    </div>
  );
}
