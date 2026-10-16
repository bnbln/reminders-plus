import React from "react";
import { useRouter } from "expo-router";

export type TaskWorkspaceState = {
  selectedTaskId: string | undefined;
  openTask: (id: string) => void;
};

export const TaskWorkspaceContext = React.createContext<TaskWorkspaceState | null>(null);

export function useTaskWorkspace() {
  return React.useContext(TaskWorkspaceContext);
}

/** Lists select a native detail column; other entry points keep the public task route. */
export function useOpenTask() {
  const workspace = useTaskWorkspace();
  const router = useRouter();
  return React.useCallback((id: string) => {
    if (workspace) workspace.openTask(id);
    else router.push({ pathname: "/task/[id]", params: { id } });
  }, [router, workspace]);
}
