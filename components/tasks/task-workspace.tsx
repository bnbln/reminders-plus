import React from "react";

export type TaskWorkspaceProps = React.PropsWithChildren<{
  title: string;
  homeFilters?: boolean;
  projectId?: string;
  showBack?: boolean;
}>;

export function TaskWorkspace({ children }: TaskWorkspaceProps) {
  return <>{children}</>;
}
