import React from "react";

import { useSnackbar } from "@/context/snackbar-store";
import { useTasksStore } from "@/context/tasks-store";
import { t } from "@/i18n";

/**
 * Moves a task to the trash and offers Undo in a snackbar. Swipe delete stays
 * one gesture without a confirmation; Undo restores it in place.
 */
export function useUndoableTaskDelete() {
  const { setTasks } = useTasksStore();
  const { showSnackbar } = useSnackbar();

  return React.useCallback(
    (taskId: string) => {
      const deletedAt = Date.now();
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, deletedAt } : task)),
      );
      showSnackbar({
        message: t("taskDetail.snackbar.deleted"),
        actionLabel: t("common.undo"),
        onAction: () =>
          setTasks((prev) =>
            prev.map((task) =>
              // Only undo this delete, not a later one of the same task.
              task.id === taskId && task.deletedAt === deletedAt
                ? { ...task, deletedAt: undefined }
                : task,
            ),
          ),
      });
    },
    [setTasks, showSnackbar],
  );
}
