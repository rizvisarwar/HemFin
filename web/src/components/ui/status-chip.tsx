import { Ban, CircleCheck, CircleX, Clock, Crown, ShieldCheck, TriangleAlert, User } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Presentational only: labels, icons and tokens come from props or constants here.
 * Each chip shows an icon and a text label, so status is never carried by colour alone.
 * Badges use text-caption (12 px) per design-system.md section 3.
 */

export type InvitationStatus = "pending" | "expired" | "accepted" | "declined" | "revoked";

const INVITATION_STATUS = {
  pending: { label: "Pending", Icon: Clock, className: "bg-muted text-foreground" },
  expired: { label: "Expired", Icon: TriangleAlert, className: "bg-warning-subtle text-warning" },
  accepted: { label: "Accepted", Icon: CircleCheck, className: "bg-success-subtle text-success" },
  declined: { label: "Declined", Icon: CircleX, className: "bg-muted text-muted-foreground" },
  revoked: { label: "Revoked", Icon: Ban, className: "bg-muted text-muted-foreground" },
} as const satisfies Record<InvitationStatus, { label: string; Icon: typeof Clock; className: string }>;

export interface StatusChipProps {
  status: InvitationStatus;
  className?: string;
}

/** Invitation status chip. Text is the status name; the icon is decorative. */
export function StatusChip({ status, className }: StatusChipProps) {
  const { label, Icon, className: tone } = INVITATION_STATUS[status];
  return (
    <span
      data-slot="status-chip"
      data-status={status}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-caption font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      {label}
    </span>
  );
}

export type HouseholdRole = "owner" | "admin" | "member";

const ROLE = {
  owner: { label: "Owner", Icon: Crown, className: "bg-primary text-primary-foreground" },
  admin: { label: "Admin", Icon: ShieldCheck, className: "bg-accent text-accent-foreground" },
  member: { label: "Member", Icon: User, className: "border border-border bg-card text-foreground" },
} as const satisfies Record<HouseholdRole, { label: string; Icon: typeof Crown; className: string }>;

export interface RoleBadgeProps {
  role: HouseholdRole;
  className?: string;
}

/** Household role label (Owner, Admin, Member) with an icon. */
export function RoleBadge({ role, className }: RoleBadgeProps) {
  const { label, Icon, className: tone } = ROLE[role];
  return (
    <span
      data-slot="role-badge"
      data-role={role}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-caption font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      {label}
    </span>
  );
}
