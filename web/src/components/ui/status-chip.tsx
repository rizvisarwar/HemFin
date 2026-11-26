import { Ban, CircleCheck, CircleX, Clock, Crown, ShieldCheck, TriangleAlert, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Presentational only: labels, icons and tokens come from the constants in this file.
 * Each chip shows an icon and a text label, so status is never carried by colour alone.
 * Chips use text-caption (12 px) per design-system.md section 3.
 */

/** Shared size, type and shape for every chip. Tone (colour) is added per chip. */
const CHIP_BASE = "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-caption font-medium whitespace-nowrap";

interface ChipShellProps {
  label: string;
  Icon: LucideIcon;
  tone: string;
  dataAttributes: Record<string, string>;
  className?: string;
}

function ChipShell({ label, Icon, tone, dataAttributes, className }: ChipShellProps) {
  return (
    <span className={cn(CHIP_BASE, tone, className)} {...dataAttributes}>
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      {label}
    </span>
  );
}

export type InvitationStatus = "pending" | "expired" | "accepted" | "declined" | "revoked";

const INVITATION_STATUS: Record<InvitationStatus, { label: string; Icon: LucideIcon; tone: string }> = {
  pending: { label: "Pending", Icon: Clock, tone: "bg-muted text-foreground" },
  expired: { label: "Expired", Icon: TriangleAlert, tone: "bg-warning-subtle text-warning" },
  accepted: { label: "Accepted", Icon: CircleCheck, tone: "bg-success-subtle text-success" },
  declined: { label: "Declined", Icon: CircleX, tone: "bg-muted text-muted-foreground" },
  revoked: { label: "Revoked", Icon: Ban, tone: "bg-muted text-muted-foreground" },
};

export interface StatusChipProps {
  status: InvitationStatus;
  className?: string;
}

/** Invitation status chip. Text is the status name; the icon is decorative. */
export function StatusChip({ status, className }: StatusChipProps) {
  const { label, Icon, tone } = INVITATION_STATUS[status];
  return (
    <ChipShell
      label={label}
      Icon={Icon}
      tone={tone}
      dataAttributes={{ "data-slot": "status-chip", "data-status": status }}
      className={className}
    />
  );
}

export type HouseholdRole = "owner" | "admin" | "member";

const ROLE: Record<HouseholdRole, { label: string; Icon: LucideIcon; tone: string }> = {
  owner: { label: "Owner", Icon: Crown, tone: "bg-primary text-primary-foreground" },
  admin: { label: "Admin", Icon: ShieldCheck, tone: "bg-accent text-accent-foreground" },
  member: { label: "Member", Icon: User, tone: "border border-border bg-card text-foreground" },
};

export interface RoleBadgeProps {
  role: HouseholdRole;
  className?: string;
}

/** Household role label (Owner, Admin, Member) with an icon. */
export function RoleBadge({ role, className }: RoleBadgeProps) {
  const { label, Icon, tone } = ROLE[role];
  return (
    <ChipShell
      label={label}
      Icon={Icon}
      tone={tone}
      dataAttributes={{ "data-slot": "role-badge", "data-role": role }}
      className={className}
    />
  );
}
