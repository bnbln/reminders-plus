import React from "react";

type TaskCreateContextValue = {
  projectId: string;
  setProjectId: (projectId: string) => void;
  clearProjectId: () => void;
  popInTaskIds: string[];
  queueTaskPopIn: (taskId: string) => void;
  consumeTaskPopIn: (taskId: string) => void;
};

const TaskCreateContext = React.createContext<TaskCreateContextValue | null>(
  null,
);

export function TaskCreateProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectIdState] = React.useState("");
  const [popInTaskIds, setPopInTaskIds] = React.useState<string[]>([]);

  const setProjectId = React.useCallback((nextProjectId: string) => {
    setProjectIdState(nextProjectId.trim());
  }, []);

  const clearProjectId = React.useCallback(() => {
    setProjectIdState("");
  }, []);

  const queueTaskPopIn = React.useCallback((rawTaskId: string) => {
    const taskId = rawTaskId.trim();
    if (!taskId) return;
    setPopInTaskIds((prev) => {
      if (prev.includes(taskId)) return prev;
      const next = [...prev, taskId];
      return next.length > 12 ? next.slice(next.length - 12) : next;
    });
  }, []);

  const consumeTaskPopIn = React.useCallback((rawTaskId: string) => {
    const taskId = rawTaskId.trim();
    if (!taskId) return;
    setPopInTaskIds((prev) => prev.filter((id) => id !== taskId));
  }, []);

  const value = React.useMemo(
    () => ({
      projectId,
      setProjectId,
      clearProjectId,
      popInTaskIds,
      queueTaskPopIn,
      consumeTaskPopIn,
    }),
    [
      clearProjectId,
      consumeTaskPopIn,
      popInTaskIds,
      projectId,
      queueTaskPopIn,
      setProjectId,
    ],
  );

  return (
    <TaskCreateContext.Provider value={value}>
      {children}
    </TaskCreateContext.Provider>
  );
}

export function useTaskCreateContext() {
  const ctx = React.useContext(TaskCreateContext);
  if (!ctx) {
    throw new Error("useTaskCreateContext must be used within TaskCreateProvider");
  }
  return ctx;
}
