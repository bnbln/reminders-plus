import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import React from "react";
import {
  DynamicColorIOS,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { GlassSurface } from "@/components/ui/glass-surface";
import { usePremium } from "@/context/premium-store";
import { type TaskCreateMode } from "@/context/task-create-context";
import { useTasksStore } from "@/context/tasks-store";
import { getLocale, t } from "@/i18n";
import { shouldRouteToProjectLimitGate } from "@/utils/project-creation-gate";

type Props = {
  mode: TaskCreateMode;
  projectId: string;
  projectName: string;
  presetDateStart: number;
};

const PRIMARY_BLUE = "#0A84FF";

export function TaskCreateBottomAccessory({
  mode,
  projectId,
  projectName,
  presetDateStart,
}: Props) {
  // BottomAccessory renders separate regular + inline instances.
  // Keep all business state derived from props/context instead of local component state.
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const router = useRouter();
  const locale = getLocale();
  const { projects } = useTasksStore();
  const { hasPremiumAccess, isReady } = usePremium();

  const resolvedProjectId = React.useMemo(() => projectId.trim(), [projectId]);
  const resolvedProjectName = React.useMemo(
    () => projectName.trim() || t("common.project"),
    [projectName],
  );
  const activeProjectCount = React.useMemo(
    () => projects.filter((project) => !project.deletedAt).length,
    [projects],
  );
  const label = React.useMemo(() => {
    switch (mode) {
      case "project":
        return getLocalizedAddProjectTitle(locale);
      case "inProject":
        return getLocalizedAddInProjectTitle(locale, resolvedProjectName);
      default:
        return t("home.addTask");
    }
  }, [locale, mode, resolvedProjectName]);

  const handlePress = React.useCallback(() => {
    switch (mode) {
      case "project":
        router.push(
          shouldRouteToProjectLimitGate({
            activeProjectCount,
            hasPremiumAccess,
            isReady,
          })
            ? "/project/limit-modal"
            : "/project/create-modal",
        );
        return;
      case "inProject":
        if (resolvedProjectId) {
          router.push({
            pathname: "/task/create-modal",
            params: { projectId: resolvedProjectId },
          });
          return;
        }
        router.push("/task/create-modal");
        return;
      case "today":
        router.push({
          pathname: "/task/create-modal",
          params: {
            preset: "today",
            ...(presetDateStart > 0
              ? { dateStart: String(Math.trunc(presetDateStart)) }
              : {}),
          },
        });
        return;
      case "routine":
        router.push({
          pathname: "/task/create-modal",
          params: { preset: "routine" },
        });
        return;
      default:
        router.push("/task/create-modal");
    }
  }, [
    activeProjectCount,
    hasPremiumAccess,
    isReady,
    mode,
    presetDateStart,
    resolvedProjectId,
    router,
  ]);

  const isInline = placement === "inline";
  const contentColor = DynamicColorIOS({
    dark: "#FFFFFF",
    light: PRIMARY_BLUE,
  });
  const borderColor = DynamicColorIOS({
    dark: "rgba(255,255,255,0.18)",
    light: "rgba(255,255,255,0.32)",
  });
  const glassTint = DynamicColorIOS({
    dark: "rgba(15,18,24,0.28)",
    light: "rgba(255,255,255,0.26)",
  }) as unknown as string;
  const fallbackBackgroundColor = DynamicColorIOS({
    dark: "rgba(28,28,30,0.92)",
    light: "rgba(255,255,255,0.94)",
  }) as unknown as string;

  return (
    <View style={styles.host}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={handlePress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        <GlassSurface
          style={[
            styles.surface,
            isInline ? styles.inlineSurface : styles.regularSurface,
            { borderColor },
          ]}
          glassEffectStyle="regular"
          tintColor={glassTint}
          fallbackBackgroundColor={fallbackBackgroundColor}
          isInteractive
        >
          <View style={isInline ? styles.inlineContent : styles.regularContent}>
            <MaterialIcons
              color={contentColor}
              name="add"
              size={isInline ? 20 : 18}
            />
            {!isInline ? (
              <Text numberOfLines={1} style={[styles.label, { color: contentColor }]}>
                {label}
              </Text>
            ) : null}
          </View>
        </GlassSurface>
      </Pressable>
    </View>
  );
}

function getLocalizedAddProjectTitle(locale: ReturnType<typeof getLocale>) {
  switch (locale) {
    case "de":
      return "Projekt hinzufügen";
    case "es":
      return "Agregar proyecto";
    case "fr":
      return "Ajouter un projet";
    case "pt":
      return "Adicionar projeto";
    case "hi":
      return "प्रोजेक्ट जोड़ें";
    case "zh":
      return "添加项目";
    case "ja":
      return "プロジェクトを追加";
    case "it":
      return "Aggiungi progetto";
    case "sv":
      return "Lägg till projekt";
    case "da":
      return "Tilføj projekt";
    case "fi":
      return "Lisää projekti";
    case "pl":
      return "Dodaj projekt";
    case "nl":
      return "Project toevoegen";
    case "tr":
      return "Proje ekle";
    case "cs":
      return "Přidat projekt";
    case "hu":
      return "Projekt hozzáadása";
    case "ro":
      return "Adaugă proiect";
    case "el":
      return "Προσθήκη έργου";
    case "id":
      return "Tambah proyek";
    case "vi":
      return "Thêm dự án";
    case "ko":
      return "프로젝트 추가";
    case "uk":
      return "Додати проєкт";
    case "ru":
      return "Добавить проект";
    case "ar":
      return "إضافة مشروع";
    default:
      return "Add project";
  }
}

function getLocalizedAddInProjectTitle(
  locale: ReturnType<typeof getLocale>,
  label: string,
) {
  switch (locale) {
    case "de":
      return `In ${label} hinzufügen`;
    case "es":
      return `Agregar en ${label}`;
    case "fr":
      return `Ajouter dans ${label}`;
    case "pt":
      return `Adicionar em ${label}`;
    case "hi":
      return `${label} में जोड़ें`;
    case "zh":
      return `添加到${label}`;
    case "ja":
      return `${label}に追加`;
    case "it":
      return `Aggiungi in ${label}`;
    case "sv":
      return `Lägg till i ${label}`;
    case "da":
      return `Tilføj i ${label}`;
    case "fi":
      return `Lisää projektiin ${label}`;
    case "pl":
      return `Dodaj do ${label}`;
    case "nl":
      return `Toevoegen aan ${label}`;
    case "tr":
      return `${label} içine ekle`;
    case "cs":
      return `Přidat do ${label}`;
    case "hu":
      return `Hozzáadás ide: ${label}`;
    case "ro":
      return `Adaugă în ${label}`;
    case "el":
      return `Προσθήκη στο ${label}`;
    case "id":
      return `Tambah di ${label}`;
    case "vi":
      return `Thêm vào ${label}`;
    case "ko":
      return `${label}에 추가`;
    case "uk":
      return `Додати до ${label}`;
    case "ru":
      return `Добавить в ${label}`;
    case "ar":
      return `إضافة في ${label}`;
    default:
      return `Add in ${label}`;
  }
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  pressable: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  pressed: {
    opacity: 0.94,
  },
  surface: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  regularSurface: {
    minHeight: 36,
  },
  inlineSurface: {
    minHeight: 32,
  },
  regularContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  inlineContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
    textAlign: "center",
  },
});
