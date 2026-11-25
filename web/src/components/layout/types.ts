import type { LucideIcon } from "lucide-react";

export type SpaceType = "personal" | "household";

export interface SpaceSummary {
  id: string; // UUID from the API
  name: string; // "Personal", or the household name
  type: SpaceType;
  role?: "owner" | "admin" | "member"; // shown as meta text in the switcher
}

export type NavKey =
  | "dashboard"
  | "notifications"
  | "contracts"
  | "expenses"
  | "income"
  | "reports"
  | "documents"
  | "suggestions"
  | "assistant"
  | "household"
  | "profile";

export type NavGroup = "overview" | "money" | "insights" | "account";

export interface NavItem {
  key: NavKey;
  label: string; // full label, for example "Notifications"
  shortLabel?: string; // bottom-nav label, for example "Alerts"
  href: string; // route, for example "/contracts"
  icon: LucideIcon;
  group: NavGroup; // sidebar grouping
  placement: "bottom" | "more"; // phone placement (bottom nav or More sheet)
  badgeCount?: number; // unread count, shown on Notifications only
}
