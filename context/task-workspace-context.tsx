import React from "react";
import { useRouter } from "expo-router";

/** Every list opens tasks through the public full-screen task route. */
export function useOpenTask() {
  const router = useRouter();
  return React.useCallback((id: string) => {
    router.push({ pathname: "/task/[id]", params: { id } });
  }, [router]);
}
