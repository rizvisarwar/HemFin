"use client";

import { PageHeader, type PageHeaderProps } from "./page-header";
import { useActiveSpace } from "./app-shell-client";

/** PageHeader that shows the active space's badge. Use on pages that show space data. */
export function AppPageHeader(props: Omit<PageHeaderProps, "space" | "spaceName">) {
  const space = useActiveSpace();
  return <PageHeader {...props} space={space.type} spaceName={space.name} />;
}
