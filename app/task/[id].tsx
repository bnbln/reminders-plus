import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Platform } from "react-native";
import { TaskDetailContent } from "@/components/tasks/task-detail-content";
import { useIsRegularWidth } from "@/components/navigation/vertical-bar-safe-area";

export default function TaskViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const regular = useIsRegularWidth();
  if (Platform.OS === "ios" && Number(Platform.Version) >= 17 && regular) {
    return <Redirect href={{ pathname: "/inbox", params: { selectedTaskId: id } }} />;
  }
  return <>
    <Stack.Screen options={{ title: "", headerTitle: "", headerTransparent: true,
      headerShadowVisible: false, headerStyle: { backgroundColor: "transparent" },
      headerBackButtonDisplayMode: "minimal" }} />
    <TaskDetailContent taskId={id} onClose={() => router.back()} headerHeight={headerHeight} />
  </>;
}
