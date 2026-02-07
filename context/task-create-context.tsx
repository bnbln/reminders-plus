import React from "react";

type TaskCreateContextValue = {
  projectId: string;
  setProjectId: (projectId: string) => void;
  clearProjectId: () => void;
};

const TaskCreateContext = React.createContext<TaskCreateContextValue | null>(
  null,
);

export function TaskCreateProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectIdState] = React.useState("");

  const setProjectId = React.useCallback((nextProjectId: string) => {
    setProjectIdState(nextProjectId.trim());
  }, []);

  const clearProjectId = React.useCallback(() => {
    setProjectIdState("");
  }, []);

  const value = React.useMemo(
    () => ({ projectId, setProjectId, clearProjectId }),
    [clearProjectId, projectId, setProjectId],
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
