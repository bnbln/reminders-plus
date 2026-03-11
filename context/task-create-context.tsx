import React from "react";

export type TaskCreateMode =
  | "task"
  | "today"
  | "routine"
  | "project"
  | "inProject";

type TaskCreateContextValue = {
  projectId: string;
  setProjectId: (projectId: string) => void;
  clearProjectId: () => void;
  mode: TaskCreateMode;
  setMode: (mode: TaskCreateMode) => void;
  presetDateStart: number;
  setPresetDateStart: (dateStart: number) => void;
  clearPresetDateStart: () => void;
  popInTaskIds: string[];
  queueTaskPopIn: (taskId: string) => void;
  consumeTaskPopIn: (taskId: string) => void;
};

const TaskCreateContext = React.createContext<TaskCreateContextValue | null>(
  null,
);

export function TaskCreateProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectIdState] = React.useState("");
  const [mode, setModeState] = React.useState<TaskCreateMode>("task");
  const [presetDateStart, setPresetDateStartState] = React.useState(0);
  const [popInTaskIds, setPopInTaskIds] = React.useState<string[]>([]);

  const setProjectId = React.useCallback((nextProjectId: string) => {
    setProjectIdState(nextProjectId.trim());
  }, []);

  const clearProjectId = React.useCallback(() => {
    setProjectIdState("");
  }, []);

  const setMode = React.useCallback((nextMode: TaskCreateMode) => {
    setModeState(nextMode);
  }, []);

  const setPresetDateStart = React.useCallback((rawDateStart: number) => {
    if (!Number.isFinite(rawDateStart) || rawDateStart <= 0) {
      setPresetDateStartState(0);
      return;
    }
    setPresetDateStartState(Math.trunc(rawDateStart));
  }, []);

  const clearPresetDateStart = React.useCallback(() => {
    setPresetDateStartState(0);
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
      mode,
      setMode,
      presetDateStart,
      setPresetDateStart,
      clearPresetDateStart,
      popInTaskIds,
      queueTaskPopIn,
      consumeTaskPopIn,
    }),
    [
      clearProjectId,
      clearPresetDateStart,
      consumeTaskPopIn,
      mode,
      popInTaskIds,
      presetDateStart,
      projectId,
      queueTaskPopIn,
      setMode,
      setPresetDateStart,
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
