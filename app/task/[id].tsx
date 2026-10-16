import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { TaskDetailContent } from "@/components/tasks/task-detail-content";

export default function TaskViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  return <>
    <Stack.Screen options={{ title: "", headerTitle: "", headerTransparent: true,
      headerShadowVisible: false, headerStyle: { backgroundColor: "transparent" },
      headerBackButtonDisplayMode: "minimal" }} />
    <TaskDetailContent taskId={id} onClose={() => router.back()} headerHeight={headerHeight} />
  </>;
}
