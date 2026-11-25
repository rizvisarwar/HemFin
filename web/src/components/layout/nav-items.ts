import {
  Banknote,
  Bell,
  BarChart3,
  CircleUser,
  FileText,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Paperclip,
  Receipt,
  Users,
} from "lucide-react";
import type { NavGroup, NavItem } from "./types";

/**
 * All 11 navigation items in display order (docs/design/app-shell.md 3.1).
 * The dashboard lives at /dashboard because "/" is the public landing page.
 */
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "overview", placement: "bottom" },
  { key: "notifications", label: "Notifications", shortLabel: "Alerts", href: "/notifications", icon: Bell, group: "overview", placement: "bottom" },
  { key: "contracts", label: "Contracts", href: "/contracts", icon: FileText, group: "money", placement: "bottom" },
  { key: "expenses", label: "Expenses", href: "/expenses", icon: Receipt, group: "money", placement: "more" },
  { key: "income", label: "Income", href: "/income", icon: Banknote, group: "money", placement: "more" },
  { key: "reports", label: "Reports", href: "/reports", icon: BarChart3, group: "money", placement: "bottom" },
  { key: "documents", label: "Documents", href: "/documents", icon: Paperclip, group: "money", placement: "more" },
  { key: "suggestions", label: "Suggestions", href: "/suggestions", icon: Lightbulb, group: "insights", placement: "more" },
  { key: "assistant", label: "Assistant", href: "/assistant", icon: MessageSquare, group: "insights", placement: "more" },
  { key: "household", label: "Household", href: "/household", icon: Users, group: "account", placement: "more" },
  { key: "profile", label: "Profile", href: "/profile", icon: CircleUser, group: "account", placement: "more" },
];

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  overview: "Overview",
  money: "Money",
  insights: "Insights",
  account: "Account",
};

/** Bottom nav order: Dashboard, Contracts, Reports, Alerts (then More). */
const BOTTOM_ORDER = ["dashboard", "contracts", "reports", "notifications"];

export const BOTTOM_NAV_ITEMS: NavItem[] = BOTTOM_ORDER.map(
  (k) => NAV_ITEMS.find((i) => i.key === k) as NavItem,
);

export const MORE_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter(
  (i) => i.placement === "more",
);

/** Active route rule (app-shell.md 3.5). */
export function isActivePath(currentPath: string, href: string): boolean {
  if (currentPath === href) return true;
  return href !== "/" && currentPath.startsWith(href + "/");
}
