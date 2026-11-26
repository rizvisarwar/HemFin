"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { useFormat } from "@/components/format-provider";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { FormMessage } from "@/components/ui/form-message";
import { HemCard } from "@/components/ui/hem-card";
import { RoleBadge } from "@/components/ui/status-chip";
import type { MemberResponse, Role } from "@/lib/api";
import {
  canInvite,
  displayName,
  initials,
  memberActions,
  sortMembers,
} from "@/lib/households/households";
import { ChangeRoleDialog, RemoveMemberDialog, TransferOwnershipDialog } from "./member-dialogs";

type DialogState = { kind: "role" | "remove" | "transfer"; member: MemberResponse; open: boolean; key: number } | null;

function Avatar({ member }: { member: MemberResponse }) {
  // Decorative: the name is next to it.
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-small font-medium text-foreground"
    >
      {initials(member)}
    </span>
  );
}

function YouTag() {
  return <span className="rounded bg-muted px-1.5 text-caption text-muted-foreground">You</span>;
}

/**
 * The members of a household: cards on phone, a table from md up. Owners and admins change roles
 * and remove people; only the owner transfers ownership. The UI hides actions a role cannot use
 * (`memberActions`), and the API stays the authority: a refusal shows its message in the dialog.
 */
export function MembersView({
  spaceId,
  householdName,
  viewerId,
  viewerRole,
  members,
}: {
  spaceId: string;
  householdName: string;
  viewerId: string;
  viewerRole: Role;
  members: MemberResponse[];
}) {
  const router = useRouter();
  const hydrated = useHydrated(); // buttons stay disabled until their click handlers exist
  const { date } = useFormat();
  const heading = React.useRef<HTMLHeadingElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const succeeded = React.useRef(false);
  const seq = React.useRef(0);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const sorted = sortMembers(members);

  function openDialog(kind: "role" | "remove" | "transfer", member: MemberResponse) {
    // Remember the button that opened the dialog, so Cancel can return focus to it.
    if (kind !== "transfer" || !dialog) opener.current = document.activeElement as HTMLElement | null;
    succeeded.current = false;
    setMessage(null);
    setDialog({ kind, member, open: true, key: ++seq.current });
  }

  function closeDialog() {
    setDialog((d) => (d ? { ...d, open: false } : d));
  }

  function done(text: string) {
    succeeded.current = true;
    setMessage(text);
    closeDialog();
    router.refresh(); // re-reads the members, and the shell's spaces (the viewer's own role may have changed)
  }

  // After a success the row (and the button that opened the dialog) may be gone: go to the heading.
  const finalFocus = () => (succeeded.current ? heading.current : opener.current?.isConnected ? opener.current : heading.current);

  function rowActions(member: MemberResponse) {
    const actions = memberActions(viewerRole, viewerId, member);
    const name = displayName(member);
    if (!actions.changeRole && !actions.remove) return null;
    return (
      <>
        {actions.changeRole ? (
          <Button type="button" variant="outline" size="sm" disabled={!hydrated} aria-label={`Change role for ${name}`} onClick={() => openDialog("role", member)}>
            Change role
          </Button>
        ) : null}
        {actions.remove ? (
          <Button type="button" variant="outline" size="sm" disabled={!hydrated} aria-label={`Remove ${name}`} onClick={() => openDialog("remove", member)}>
            Remove
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <section aria-labelledby="members-heading" data-testid="members">
      <h2 id="members-heading" ref={heading} tabIndex={-1} className="text-h2 outline-none">
        Members ({members.length})
      </h2>
      <p className="mt-1 text-body text-muted-foreground">Owners and admins manage who has access.</p>
      <p className="mt-1 text-small text-muted-foreground">Email addresses are shown to members of this household only.</p>

      <div className={message ? "mt-4" : undefined}>
        <FormMessage kind="success" id="members-message">
          {message}
        </FormMessage>
      </div>

      {/* Phone: one card per member. Tablet and desktop: a table ("Joined" appears from xl). Both are
          the shared components in ui/, fed the same rows. */}
      <ResponsiveList
        className="mt-4"
        label="Members"
        rows={sorted}
        getRowKey={(m) => m.user_id}
        cardTestId="member-card"
        renderCard={(m) => {
          const name = displayName(m);
          const actions = rowActions(m);
          return (
            <>
              <div className="flex items-start gap-3">
                <Avatar member={m} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-body-strong">{name}</span>
                    <RoleBadge role={m.role} />
                  </div>
                  {name !== m.email ? <p className="text-small text-muted-foreground [overflow-wrap:anywhere]">{m.email}</p> : null}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-small text-muted-foreground">
                    <span>Joined {date(m.joined_at)}</span>
                    {m.user_id === viewerId ? <YouTag /> : null}
                  </p>
                </div>
              </div>
              {actions ? <div className="mt-3 flex gap-2 [&>*]:flex-1">{actions}</div> : null}
            </>
          );
        }}
      />
      <DataTable
        className="mt-4"
        label="Members"
        rows={sorted}
        getRowKey={(m) => m.user_id}
        rowTestId="member-row"
        columns={[
          {
            id: "member",
            header: "Member",
            cell: (m) => {
              const name = displayName(m);
              return (
                <div className="flex items-center gap-3">
                  <Avatar member={m} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body-strong">
                      <span className="break-words">{name}</span>
                      {m.user_id === viewerId ? <YouTag /> : null}
                    </p>
                    {name !== m.email ? <p className="text-small text-muted-foreground [overflow-wrap:anywhere]">{m.email}</p> : null}
                  </div>
                </div>
              );
            },
          },
          { id: "role", header: "Role", cell: (m) => <RoleBadge role={m.role} /> },
          {
            id: "joined",
            header: "Joined",
            from: "xl",
            align: "right",
            className: "whitespace-nowrap text-small text-muted-foreground",
            cell: (m) => date(m.joined_at),
          },
          {
            id: "actions",
            header: "Actions",
            srOnlyHeader: true,
            align: "right",
            cell: (m) => <div className="flex justify-end gap-2">{rowActions(m)}</div>,
          },
        ]}
      />

      {members.length === 1 ? (
        <HemCard className="mt-4" data-testid="only-owner">
          <EmptyState
            variant="inline"
            icon={Mail}
            titleAs="h3"
            title="Invite your family"
            description="Invite a partner or family member by email. They see only what the household shares."
            primaryAction={canInvite(viewerRole) ? { label: "Invite a member", href: `/household/${spaceId}/invitations` } : undefined}
          />
        </HemCard>
      ) : null}

      {dialog?.kind === "role" ? (
        <ChangeRoleDialog
          key={dialog.key}
          open={dialog.open}
          onOpenChange={(open) => (open ? undefined : closeDialog())}
          spaceId={spaceId}
          householdName={householdName}
          member={dialog.member}
          onDone={done}
          finalFocus={finalFocus}
          onTransfer={() => openDialog("transfer", dialog.member)}
        />
      ) : null}
      {dialog?.kind === "remove" ? (
        <RemoveMemberDialog
          key={dialog.key}
          open={dialog.open}
          onOpenChange={(open) => (open ? undefined : closeDialog())}
          spaceId={spaceId}
          householdName={householdName}
          member={dialog.member}
          onDone={done}
          finalFocus={finalFocus}
        />
      ) : null}
      {dialog?.kind === "transfer" ? (
        <TransferOwnershipDialog
          key={dialog.key}
          open={dialog.open}
          onOpenChange={(open) => (open ? undefined : closeDialog())}
          spaceId={spaceId}
          householdName={householdName}
          member={dialog.member}
          onDone={done}
          finalFocus={finalFocus}
        />
      ) : null}
    </section>
  );
}
