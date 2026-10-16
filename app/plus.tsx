import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import {
  Stack,
  useLocalSearchParams,
  useRouter,
  type NativeStackHeaderItem,
} from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  REMINDS_PLUS_LIFETIME_PRODUCT_ID,
  REMINDS_PLUS_MONTHLY_PRODUCT_ID,
} from "@/constants/premium";
import { Colors } from "@/constants/theme";
import { usePremium } from "@/context/premium-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { ripple } from "@/components/ui/ripple";
import { useVerticalBarActive } from "@/components/navigation/vertical-bar-safe-area";
import {
  assistCopyKey,
  IS_ASSIST_SUPPORTED,
  IS_CLOUD_SYNC_SUPPORTED,
} from "@/utils/assist-availability";

type ThemeName = keyof typeof Colors;
type PurchaseOption = "monthly" | "lifetime";
type PlusScreenProps = {
  sourceOverride?: string;
  closeFallbackHref?: string;
  headerTitle?: string;
  showsCloseButton?: boolean;
};

const IOS_LIGHT_BASE_BACKGROUND = "#F2F2F7";
const IOS_LIGHT_ELEVATED_SURFACE = "#FFFFFF";
const IOS_LIGHT_BORDER = "rgba(60, 60, 67, 0.18)";
const IOS_DARK_ELEVATED_SURFACE = "#1C1C1E";
const IOS_DARK_BORDER = "rgba(255,255,255,0.12)";

const BENEFITS = [
  {
    id: "assist",
    icon: "auto-awesome",
    tint: "#34C759",
    titleKey: "plus.benefit.assist",
  },
  {
    id: "projects",
    icon: "folder-open",
    tint: "#3B82F6",
    titleKey: "plus.benefit.projects",
  },
  {
    id: "sync",
    icon: "cloud-done",
    tint: "#F59E0B",
    titleKey: "plus.benefit.sync",
  },
] as const;

function resolveSourceCopy(source: string) {
  switch (source) {
    case "assist":
      return t("plus.source.assist");
    case "projects":
      return t("plus.source.projects");
    case "sync":
      return t("plus.source.sync");
    default:
      return t(assistCopyKey("plus.source.default"));
  }
}

function resolveStoreProductTitle(
  product: { displayName?: string | null; title?: string | null } | null,
  fallback: string,
): string {
  const displayName = product?.displayName?.trim();
  if (displayName) return displayName;

  const title = product?.title?.trim();
  if (title) return title;

  return fallback;
}

function OfferCard({
  title,
  price,
  meta,
  selected,
  activeLabel,
  disabled,
  variant,
  isDark,
  onPress,
}: {
  title: string;
  price: string;
  meta: string;
  selected: boolean;
  activeLabel?: string;
  disabled?: boolean;
  variant: PurchaseOption;
  isDark: boolean;
  onPress: () => void;
}) {
  const isLifetime = variant === "lifetime";
  const cardBackgroundColor = isDark
    ? isLifetime
      ? "#2A2D31"
      : IOS_DARK_ELEVATED_SURFACE
    : isLifetime
      ? "#2B2B2F"
      : IOS_LIGHT_ELEVATED_SURFACE;
  const borderColor = selected
    ? isDark
      ? "#F5F5F5"
      : "#111827"
    : isDark
      ? IOS_DARK_BORDER
      : IOS_LIGHT_BORDER;
  const titleColor = isLifetime ? "#FFFFFF" : isDark ? "#F3F4F6" : "#111827";
  const priceColor = isLifetime ? "#FFFFFF" : isDark ? "#FFFFFF" : "#0F172A";
  const metaColor = isLifetime
    ? "rgba(255,255,255,0.68)"
    : isDark
      ? "#98A2B3"
      : "#6B7280";
  const indicatorBorderColor = selected
    ? isDark
      ? "#FFFFFF"
      : "#111827"
    : isLifetime
      ? "rgba(255,255,255,0.28)"
      : isDark
        ? "rgba(255,255,255,0.24)"
        : "rgba(17,24,39,0.18)";
  const indicatorBackgroundColor = selected
    ? isDark
      ? "#FFFFFF"
      : "#111827"
    : "transparent";
  const indicatorCheckColor = isDark ? "#0F1115" : "#FFFFFF";
  const activePillBackground = isLifetime
    ? "rgba(255,255,255,0.12)"
    : isDark
      ? "rgba(255,255,255,0.1)"
      : "rgba(17,24,39,0.06)";
  const activePillTextColor = isLifetime ? "#FFFFFF" : titleColor;

  return (
    <Pressable
      android_ripple={ripple()}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.offerCard,
        {
          backgroundColor: cardBackgroundColor,
          borderColor,
          shadowColor: selected ? "#111827" : "transparent",
          shadowOpacity: selected && !isDark ? 0.12 : 0,
        },
        disabled && styles.offerCardDisabled,
        pressed && !disabled && styles.cardPressed,
      ]}
    >
      <View style={styles.offerCardTopRow}>
        <Text style={[styles.offerCardTitle, { color: titleColor }]}>
          {title}
        </Text>
        <View
          style={[
            styles.selectionIndicator,
            {
              borderColor: indicatorBorderColor,
              backgroundColor: indicatorBackgroundColor,
            },
          ]}
        >
          {selected ? (
            <MaterialIcons name="check" size={14} color={indicatorCheckColor} />
          ) : null}
        </View>
      </View>

      <View style={styles.offerCopyBlock}>
        <Text style={[styles.offerCardPrice, { color: priceColor }]}>
          {price}
        </Text>
        <Text style={[styles.offerCardMeta, { color: metaColor }]}>{meta}</Text>
      </View>

      {activeLabel ? (
        <View
          style={[styles.activePill, { backgroundColor: activePillBackground }]}
        >
          <Text style={[styles.activePillText, { color: activePillTextColor }]}>
            {activeLabel}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function PlusScreen({
  sourceOverride,
  closeFallbackHref = "/settings",
  headerTitle = "",
  showsCloseButton = true,
}: PlusScreenProps = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasVerticalBar = useVerticalBarActive();
  const theme = (useColorScheme() ?? "light") as ThemeName;
  const isDark = theme === "dark";
  const { source: sourceParam } = useLocalSearchParams<{
    source?: string | string[];
  }>();
  const sourceFromRoute = Array.isArray(sourceParam)
    ? (sourceParam[0] ?? "")
    : (sourceParam ?? "");
  const source = sourceOverride ?? sourceFromRoute;
  const {
    isSupported,
    isStoreConnected,
    isReady,
    isRefreshing,
    isRestoring,
    plan,
    errorMessage,
    purchaseInFlightProductId,
    monthlyProduct,
    lifetimeProduct,
    refresh,
    purchaseMonthly,
    purchaseLifetime,
    restorePurchases,
    clearError,
  } = usePremium();
  const [selectedOption, setSelectedOption] =
    React.useState<PurchaseOption>("lifetime");
  const [showsLegalDisclosure, setShowsLegalDisclosure] = React.useState(false);

  React.useEffect(() => {
    if (plan === "lifetime") {
      setSelectedOption("lifetime");
    }
  }, [plan]);

  const screenBackground = isDark
    ? Colors[theme].background
    : IOS_LIGHT_BASE_BACKGROUND;
  const borderColor = isDark ? IOS_DARK_BORDER : IOS_LIGHT_BORDER;
  const headerTextColor = Colors[theme].text;
  const supportTextColor = isDark ? "#8E8E93" : "#6B7280";
  const restoreTextColor = isDark ? "#8E8E93" : "#6B7280";
  const legalTextColor = isDark ? "#8E8E93" : "#6B7280";
  const errorBackground = isDark
    ? "rgba(127,29,29,0.24)"
    : "rgba(254,242,242,0.94)";
  const errorBorder = isDark
    ? "rgba(248,113,113,0.28)"
    : "rgba(180,35,24,0.16)";
  const errorTextColor = isDark ? "#FECACA" : "#7A271A";
  const checkoutBackgroundColor = isDark ? "#FFFFFF" : "#090909";
  const checkoutTextColor = isDark ? "#0F1115" : "#FFFFFF";
  const disabledCheckoutBackground = isDark ? "#4B5563" : "#A1A1AA";
  const sourceCopy = resolveSourceCopy(source);
  // Assist and Cloud Sync are Apple-only, so don't advertise them on platforms
  // that cannot run them.
  const visibleBenefits = React.useMemo(
    () =>
      BENEFITS.filter((benefit) => {
        if (benefit.id === "assist") return IS_ASSIST_SUPPORTED;
        if (benefit.id === "sync") return IS_CLOUD_SYNC_SUPPORTED;
        return true;
      }),
    [],
  );
  const monthlyTitle = resolveStoreProductTitle(
    monthlyProduct,
    t("plus.offer.monthly.title"),
  );
  const lifetimeTitle = resolveStoreProductTitle(
    lifetimeProduct,
    t("plus.offer.lifetime.title"),
  );
  const monthlyPrice = monthlyProduct?.displayPrice ?? "…";
  const lifetimePrice = lifetimeProduct?.displayPrice ?? "…";

  const onClose = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(closeFallbackHref as any);
  }, [closeFallbackHref, router]);
  const nativeCloseHeaderItems = React.useMemo<NativeStackHeaderItem[]>(
    () =>
      showsCloseButton && hasVerticalBar
        ? [
            {
              type: "button",
              label: "",
              icon: { type: "sfSymbol", name: "xmark" },
              accessibilityLabel: t("common.close"),
              onPress: onClose,
            },
          ]
        : [],
    [hasVerticalBar, onClose, showsCloseButton],
  );

  const onPurchaseMonthly = React.useCallback(async () => {
    clearError();
    const result = await purchaseMonthly();

    if (result === "purchased") {
      onClose();
      return;
    }

    if (result === "debug_unlocked") {
      Alert.alert(
        t("plus.alert.debugUnlock.title"),
        t("plus.alert.debugUnlock.bodyMonthly"),
        [{ text: t("common.ok"), onPress: onClose }],
      );
    }
  }, [clearError, onClose, purchaseMonthly]);

  const onPurchaseLifetime = React.useCallback(async () => {
    clearError();
    const result = await purchaseLifetime();

    if (result === "purchased") {
      Alert.alert(
        t("plus.alert.lifetimeActivated.title"),
        t("plus.alert.lifetimeActivated.body"),
        [
          {
            text: t("plus.alert.openAppleSubscriptions"),
            onPress: () => {
              void Linking.openURL(
                "https://apps.apple.com/account/subscriptions",
              );
              onClose();
            },
          },
          {
            text: t("common.ok"),
            style: "cancel",
            onPress: onClose,
          },
        ],
      );
      return;
    }

    if (result === "debug_unlocked") {
      Alert.alert(
        t("plus.alert.debugUnlock.title"),
        t("plus.alert.debugUnlock.bodyLifetime"),
        [{ text: t("common.ok"), onPress: onClose }],
      );
    }
  }, [clearError, onClose, purchaseLifetime]);

  const onRestore = React.useCallback(async () => {
    clearError();
    const restored = await restorePurchases();
    if (restored) {
      Alert.alert(
        t("plus.alert.restored.title"),
        t("plus.alert.restored.body"),
      );
    }
  }, [clearError, restorePurchases]);

  const onRefreshProducts = React.useCallback(async () => {
    clearError();
    await refresh();
  }, [clearError, refresh]);

  const selectedProductId =
    selectedOption === "monthly"
      ? REMINDS_PLUS_MONTHLY_PRODUCT_ID
      : REMINDS_PLUS_LIFETIME_PRODUCT_ID;
  const isSelectedProductLoaded =
    selectedOption === "monthly" ? Boolean(monthlyProduct) : Boolean(lifetimeProduct);
  const isPurchaseInFlight = purchaseInFlightProductId === selectedProductId;
  const isSelectedAlreadyActive =
    (selectedOption === "monthly" && plan === "monthly") ||
    (selectedOption === "lifetime" && plan === "lifetime");
  const isCheckoutDisabled =
    !isSupported ||
    !isStoreConnected ||
    !isReady ||
    !isSelectedProductLoaded ||
    isPurchaseInFlight ||
    isSelectedAlreadyActive;
  const checkoutLabel = !isSupported
    ? t("plus.checkout.onlyIos")
    : !isStoreConnected
      ? t("plus.checkout.noStoreAccess")
    : !isReady
      ? t("plus.checkout.connecting")
      : !isSelectedProductLoaded
        ? t("plus.checkout.productUnavailable")
    : isSelectedAlreadyActive
      ? selectedOption === "lifetime"
        ? t("plus.checkout.alreadyUnlocked")
        : t("plus.checkout.alreadyActive")
      : t("plus.checkout.complete");

  const onCheckout = React.useCallback(async () => {
    if (selectedOption === "monthly") {
      await onPurchaseMonthly();
      return;
    }

    await onPurchaseLifetime();
  }, [onPurchaseLifetime, onPurchaseMonthly, selectedOption]);

  return (
    <View style={[styles.screen, { backgroundColor: screenBackground }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          presentation: "modal",
          headerTitle,
          headerShadowVisible: false,
          headerTransparent: true,
          headerTintColor: headerTextColor,
          headerRight: showsCloseButton && !hasVerticalBar
            ? () => (
                <Pressable
                  android_ripple={ripple()}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                  onPress={onClose}
                >
                  <MaterialIcons name="close" size={22} color={headerTextColor} />
                </Pressable>
              )
            : undefined,
          unstable_headerRightItems: hasVerticalBar
            ? () => nativeCloseHeaderItems
            : undefined,
        }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 80,
          paddingBottom: Math.max(insets.bottom + 22, 30),
          gap: 22,
        }}
      >
        <LinearGradient
          colors={isDark ? ["#070B11", "#0E1726"] : ["#05070B", "#071326"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, { borderColor }]}
        >
          <Text style={styles.heroTitle}>{t("plus.hero.title")}</Text>
          <Text style={styles.heroSubtitle}>{sourceCopy}</Text>

          <View style={styles.benefitsCard}>
            {visibleBenefits.map((benefit, index) => (
              <View key={benefit.id}>
                <View style={styles.benefitRow}>
                  <View
                    style={[
                      styles.benefitIconWrap,
                      { backgroundColor: `${benefit.tint}22` },
                    ]}
                  >
                    <MaterialIcons
                      name={benefit.icon}
                      size={18}
                      color={benefit.tint}
                    />
                  </View>
                  <Text style={styles.benefitText}>{t(benefit.titleKey)}</Text>
                </View>
                {index < visibleBenefits.length - 1 ? (
                  <View style={styles.benefitDivider} />
                ) : null}
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.checkoutSection}>
          <View style={styles.offerGrid}>
            <OfferCard
              variant="lifetime"
              title={lifetimeTitle}
              price={lifetimePrice}
              meta={t("plus.offer.lifetime.meta")}
              selected={selectedOption === "lifetime"}
              activeLabel={plan === "lifetime" ? t("common.active") : undefined}
              isDark={isDark}
              onPress={() => setSelectedOption("lifetime")}
            />
            <OfferCard
              variant="monthly"
              title={monthlyTitle}
              price={monthlyPrice}
              meta={t("plus.offer.monthly.meta")}
              selected={selectedOption === "monthly"}
              activeLabel={plan === "monthly" ? t("common.active") : undefined}
              disabled={plan === "lifetime"}
              isDark={isDark}
              onPress={() => setSelectedOption("monthly")}
            />
          </View>

          {errorMessage ? (
            <View
              style={[
                styles.errorCard,
                {
                  backgroundColor: errorBackground,
                  borderColor: errorBorder,
                },
              ]}
            >
              <MaterialIcons name="error-outline" size={18} color="#EF4444" />
              <Text style={[styles.errorText, { color: errorTextColor }]}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <Pressable
            android_ripple={ripple()}
            accessibilityRole="button"
            disabled={isCheckoutDisabled}
            onPress={() => {
              void onCheckout();
            }}
            style={({ pressed }) => [
              styles.checkoutButton,
              {
                backgroundColor: isCheckoutDisabled
                  ? disabledCheckoutBackground
                  : checkoutBackgroundColor,
              },
              pressed && !isCheckoutDisabled && styles.cardPressed,
            ]}
          >
            {isPurchaseInFlight ? (
              <ActivityIndicator color={checkoutTextColor} />
            ) : (
              <Text
                style={[
                  styles.checkoutButtonText,
                  { color: checkoutTextColor },
                ]}
              >
                {checkoutLabel}
              </Text>
            )}
          </Pressable>

          {isSupported && !isStoreConnected ? (
            <Text style={[styles.supportText, { color: supportTextColor }]}>
              {t("plus.support.noStoreConnection")}
            </Text>
          ) : null}

          {isSupported &&
          isStoreConnected &&
          isReady &&
          !isSelectedProductLoaded &&
          !errorMessage ? (
            <Text style={[styles.supportText, { color: supportTextColor }]}>
              {t("plus.support.productNotLoaded")}
            </Text>
          ) : null}

          {Platform.OS !== "ios" || !isSupported ? (
            <Text style={[styles.supportText, { color: supportTextColor }]}>
              {t("plus.support.iapOnlyIos")}
            </Text>
          ) : null}

          <Pressable
            android_ripple={ripple()}
            accessibilityRole="button"
            disabled={isRestoring}
            onPress={() => {
              void onRestore();
            }}
            style={({ pressed }) => [
              styles.restoreLink,
              pressed && !isRestoring && styles.restoreLinkPressed,
            ]}
          >
            {isRestoring ? (
              <ActivityIndicator color={restoreTextColor} />
            ) : (
              <Text
                style={[styles.restoreLinkText, { color: restoreTextColor }]}
              >
                {t("plus.action.restorePurchases")}
              </Text>
            )}
          </Pressable>

          {isSupported ? (
            <Pressable
              android_ripple={ripple()}
              accessibilityRole="button"
              disabled={isRefreshing}
              onPress={() => {
                void onRefreshProducts();
              }}
              style={({ pressed }) => [
                styles.restoreLink,
                pressed && !isRefreshing && styles.restoreLinkPressed,
              ]}
            >
              {isRefreshing ? (
                <ActivityIndicator color={restoreTextColor} />
              ) : (
                <Text
                  style={[styles.restoreLinkText, { color: restoreTextColor }]}
                >
                  {t("plus.action.reloadProducts")}
                </Text>
              )}
            </Pressable>
          ) : null}

          <Pressable
            android_ripple={ripple()}
            accessibilityRole="button"
            onPress={() => setShowsLegalDisclosure((current) => !current)}
            style={({ pressed }) => [
              styles.legalDisclosureToggle,
              pressed && styles.restoreLinkPressed,
            ]}
          >
            <View style={styles.legalDisclosureToggleRow}>
              <Text
                style={[styles.legalDisclosureToggleText, { color: legalTextColor }]}
              >
                {showsLegalDisclosure
                  ? t("plus.legal.hide")
                  : t("plus.legal.show")}
              </Text>
              <MaterialIcons
                name={showsLegalDisclosure ? "expand-less" : "expand-more"}
                size={16}
                color={legalTextColor}
              />
            </View>
          </Pressable>

          {showsLegalDisclosure ? (
            <Text style={[styles.legalDisclosureText, { color: legalTextColor }]}>
              {t(assistCopyKey("plus.legal.disclaimer"))}
            </Text>
          ) : null}

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    borderRadius: 32,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1.1,
    color: "#FFFFFF",
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(226,232,240,0.78)",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  benefitsCard: {
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  benefitIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    color: "#F8FAFC",
  },
  benefitDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  checkoutSection: {
    gap: 14,
    paddingHorizontal: 2,
  },
  offerGrid: {
    flexDirection: "row",
    gap: 12,
  },
  offerCard: {
    flex: 1,
    minHeight: 180,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1.5,
    justifyContent: "space-between",
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  offerCardDisabled: {
    opacity: 0.56,
  },
  offerCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  offerCardTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    maxWidth: "80%",
  },
  offerCopyBlock: {
    gap: 6,
  },
  offerCardPrice: {
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -1,
  },
  offerCardMeta: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  selectionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  activePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  activePillText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  checkoutButton: {
    minHeight: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    marginTop: 4,
  },
  checkoutButtonText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  supportText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  restoreLink: {
    alignSelf: "center",
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  restoreLinkPressed: {
    opacity: 0.72,
  },
  restoreLinkText: {
    fontSize: 14,
    lineHeight: 18,
    textDecorationLine: "underline",
  },
  legalDisclosureToggle: {
    alignSelf: "center",
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  legalDisclosureToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legalDisclosureToggleText: {
    fontSize: 12,
    lineHeight: 16,
    textDecorationLine: "underline",
  },
  legalDisclosureText: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  errorCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
