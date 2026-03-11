import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import {
  ErrorCode,
  getActiveSubscriptions as queryActiveSubscriptions,
  getAvailablePurchases as queryAvailablePurchases,
  type Product,
  type ProductSubscription,
  type Purchase,
  type PurchaseError,
  useIAP,
} from "expo-iap";

import {
  REMINDS_PLUS_LIFETIME_PRODUCT_ID,
  REMINDS_PLUS_MONTHLY_PRODUCT_ID,
  REMINDS_PLUS_SUBSCRIPTION_IDS,
  type PremiumPlan,
} from "@/constants/premium";

export type PurchaseAttemptResult =
  | "purchased"
  | "debug_unlocked"
  | "cancelled"
  | "failed";

type PremiumContextValue = {
  isSupported: boolean;
  isStoreConnected: boolean;
  isReady: boolean;
  isRefreshing: boolean;
  isRestoring: boolean;
  hasPremiumAccess: boolean;
  plan: PremiumPlan;
  errorMessage: string | null;
  purchaseInFlightProductId: string | null;
  monthlyProduct: ProductSubscription | null;
  lifetimeProduct: Product | null;
  refresh: () => Promise<void>;
  purchaseMonthly: () => Promise<PurchaseAttemptResult>;
  purchaseLifetime: () => Promise<PurchaseAttemptResult>;
  restorePurchases: () => Promise<boolean>;
  clearError: () => void;
};

const noopAsync = async (): Promise<PurchaseAttemptResult> => "failed";
const noopRefresh = async () => undefined;
const noopRestore = async () => false;
const DEBUG_PREMIUM_OVERRIDE_STORAGE_KEY =
  "reminds.debug.premium-override.v1";

const unsupportedValue: PremiumContextValue = {
  isSupported: false,
  isStoreConnected: false,
  isReady: true,
  isRefreshing: false,
  isRestoring: false,
  hasPremiumAccess: false,
  plan: "free",
  errorMessage: null,
  purchaseInFlightProductId: null,
  monthlyProduct: null,
  lifetimeProduct: null,
  refresh: noopRefresh,
  purchaseMonthly: noopAsync,
  purchaseLifetime: noopAsync,
  restorePurchases: noopRestore,
  clearError: () => undefined,
};

const PremiumContext = React.createContext<PremiumContextValue>(unsupportedValue);

function isMissingSkuError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PurchaseError).code === ErrorCode.ItemUnavailable
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return /sku not found|item unavailable|product not available/i.test(message);
}

function isUserCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PurchaseError).code === ErrorCode.UserCancelled
  );
}

function toErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PurchaseError).code === ErrorCode.UserCancelled
  ) {
    return "";
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PurchaseError).code === ErrorCode.NetworkError
  ) {
    return "Der App Store ist gerade nicht erreichbar.";
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PurchaseError).code === ErrorCode.ItemUnavailable
  ) {
    return "Dieses Produkt ist in App Store Connect noch nicht verfuegbar.";
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Der Kauf konnte nicht abgeschlossen werden.";
}

function isEntitlingPurchase(purchase: Purchase, productId: string): boolean {
  if (purchase.productId !== productId) return false;
  if (purchase.purchaseState !== "purchased") return false;

  if (
    "revocationDateIOS" in purchase &&
    typeof purchase.revocationDateIOS === "number" &&
    purchase.revocationDateIOS > 0
  ) {
    return false;
  }

  if (
    "expirationDateIOS" in purchase &&
    typeof purchase.expirationDateIOS === "number" &&
    purchase.expirationDateIOS > 0 &&
    purchase.expirationDateIOS <= Date.now()
  ) {
    return false;
  }

  return true;
}

function normalizePurchaseResult(
  value: Purchase | Purchase[] | null | undefined,
): Purchase[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function derivePlan(args: {
  availablePurchases: Purchase[];
  activeSubscriptionProductIds: string[];
}): PremiumPlan {
  const hasLifetime = args.availablePurchases.some((purchase) =>
    isEntitlingPurchase(purchase, REMINDS_PLUS_LIFETIME_PRODUCT_ID),
  );
  if (hasLifetime) return "lifetime";

  const hasMonthly = args.activeSubscriptionProductIds.includes(
    REMINDS_PLUS_MONTHLY_PRODUCT_ID,
  )
    ? true
    : args.availablePurchases.some((purchase) =>
        isEntitlingPurchase(purchase, REMINDS_PLUS_MONTHLY_PRODUCT_ID),
      );

  return hasMonthly ? "monthly" : "free";
}

function PremiumProviderIOS({ children }: { children: React.ReactNode }) {
  const {
    connected,
    products,
    subscriptions,
    availablePurchases,
    activeSubscriptions,
    fetchProducts: fetchProductsFromHook,
    getAvailablePurchases,
    getActiveSubscriptions,
    requestPurchase,
    finishTransaction,
    restorePurchases: restoreIapPurchases,
  } = useIAP();

  const [isReady, setIsReady] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isRestoring, setIsRestoring] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [purchaseInFlightProductId, setPurchaseInFlightProductId] =
    React.useState<string | null>(null);
  const [debugOverridePlan, setDebugOverridePlan] =
    React.useState<PremiumPlan | null>(null);
  const [isDebugOverrideLoaded, setIsDebugOverrideLoaded] = React.useState(!__DEV__);

  const persistDebugOverride = React.useCallback(
    async (nextPlan: PremiumPlan | null) => {
      if (!__DEV__) return;

      setDebugOverridePlan(nextPlan);

      if (nextPlan === null || nextPlan === "free") {
        await AsyncStorage.removeItem(DEBUG_PREMIUM_OVERRIDE_STORAGE_KEY);
        return;
      }

      await AsyncStorage.setItem(DEBUG_PREMIUM_OVERRIDE_STORAGE_KEY, nextPlan);
    },
    [],
  );

  React.useEffect(() => {
    if (!__DEV__) return;

    let isMounted = true;

    const loadDebugOverride = async () => {
      try {
        const value = await AsyncStorage.getItem(DEBUG_PREMIUM_OVERRIDE_STORAGE_KEY);
        if (!isMounted) return;

        if (value === "monthly" || value === "lifetime") {
          setDebugOverridePlan(value);
        } else {
          setDebugOverridePlan(null);
        }
      } finally {
        if (isMounted) {
          setIsDebugOverrideLoaded(true);
        }
      }
    };

    void loadDebugOverride();

    return () => {
      isMounted = false;
    };
  }, []);

  const monthlyProduct = React.useMemo(
    () =>
      subscriptions.find(
        (product) => product.id === REMINDS_PLUS_MONTHLY_PRODUCT_ID,
      ) ??
      ((products.find(
        (product) => product.id === REMINDS_PLUS_MONTHLY_PRODUCT_ID,
      ) as unknown as ProductSubscription | undefined) ??
        null),
    [products, subscriptions],
  );
  const lifetimeProduct = React.useMemo(
    () =>
      products.find(
        (product) => product.id === REMINDS_PLUS_LIFETIME_PRODUCT_ID,
      ) ??
      ((subscriptions.find(
        (product) => product.id === REMINDS_PLUS_LIFETIME_PRODUCT_ID,
      ) as unknown as Product | undefined) ??
        null),
    [products, subscriptions],
  );

  const storePlan = React.useMemo(
    () =>
      derivePlan({
        availablePurchases,
        activeSubscriptionProductIds: activeSubscriptions
          .filter((entry) => entry.isActive)
          .map((entry) => entry.productId),
      }),
    [activeSubscriptions, availablePurchases],
  );

  const plan = debugOverridePlan ?? storePlan;
  const hasPremiumAccess = plan !== "free";
  const resolvedIsReady = isReady && isDebugOverrideLoaded;

  const grantDebugEntitlement = React.useCallback(
    async (productId: string): Promise<PurchaseAttemptResult> => {
      if (!__DEV__) return "failed";

      const nextPlan =
        productId === REMINDS_PLUS_MONTHLY_PRODUCT_ID ? "monthly" : "lifetime";

      await persistDebugOverride(nextPlan);
      setErrorMessage(null);
      setIsReady(true);

      return "debug_unlocked";
    },
    [persistDebugOverride],
  );

  const refresh = React.useCallback(async () => {
    if (!connected) return;

    setIsRefreshing(true);

    try {
      await Promise.all([
        fetchProductsFromHook({
          skus: [REMINDS_PLUS_LIFETIME_PRODUCT_ID],
          type: "in-app",
        }),
        fetchProductsFromHook({
          skus: [REMINDS_PLUS_MONTHLY_PRODUCT_ID],
          type: "subs",
        }),
      ]);
      await Promise.all([
        getAvailablePurchases(),
        getActiveSubscriptions([...REMINDS_PLUS_SUBSCRIPTION_IDS]),
      ]);
      setErrorMessage(null);
    } catch (error) {
      const message = toErrorMessage(error);
      if (message) setErrorMessage(message);
    } finally {
      setIsRefreshing(false);
      setIsReady(true);
    }
  }, [
    connected,
    fetchProductsFromHook,
    getActiveSubscriptions,
    getAvailablePurchases,
  ]);

  React.useEffect(() => {
    if (connected) {
      void refresh();
      return;
    }

    const timer = setTimeout(() => {
      setIsReady(true);
    }, 2500);

    return () => {
      clearTimeout(timer);
    };
  }, [connected, refresh]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" || !connected) return;
      void refresh();
    });

    return () => {
      subscription.remove();
    };
  }, [connected, refresh]);

  const runPurchase = React.useCallback(
    async (productId: string, type: "in-app" | "subs") => {
      if (!connected) {
        if (__DEV__) {
          return grantDebugEntitlement(productId);
        }
        setErrorMessage("Die Verbindung zum App Store wird noch aufgebaut.");
        setIsReady(true);
        return "failed";
      }

      setPurchaseInFlightProductId(productId);
      setErrorMessage(null);

      try {
        const result = await requestPurchase({
          request: {
            apple: {
              sku: productId,
            },
          },
          type,
        });

        for (const purchase of normalizePurchaseResult(result)) {
          if (purchase.purchaseState !== "purchased") continue;
          await finishTransaction({
            purchase,
            isConsumable: false,
          });
        }

        await refresh();
        return "purchased";
      } catch (error) {
        if (isUserCancelled(error)) {
          return "cancelled";
        }

        if (__DEV__ && isMissingSkuError(error)) {
          return grantDebugEntitlement(productId);
        }

        setErrorMessage(toErrorMessage(error));
        return "failed";
      } finally {
        setPurchaseInFlightProductId(null);
      }
    },
    [
      connected,
      finishTransaction,
      grantDebugEntitlement,
      refresh,
      requestPurchase,
    ],
  );

  const purchaseMonthly = React.useCallback(
    () => runPurchase(REMINDS_PLUS_MONTHLY_PRODUCT_ID, "subs"),
    [runPurchase],
  );

  const purchaseLifetime = React.useCallback(
    () => runPurchase(REMINDS_PLUS_LIFETIME_PRODUCT_ID, "in-app"),
    [runPurchase],
  );

  const restorePurchases = React.useCallback(async () => {
    if (!connected) {
      setErrorMessage("Die Verbindung zum App Store wird noch aufgebaut.");
      setIsReady(true);
      return false;
    }

    setIsRestoring(true);
    setErrorMessage(null);

    try {
      await restoreIapPurchases();
      const maxAttempts = 4;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await refresh();
        // Use direct store queries only in restore flow to avoid touching normal purchase path.
        const [purchases, activeSubscriptionsNow] = await Promise.all([
          queryAvailablePurchases({
            alsoPublishToEventListenerIOS: false,
            onlyIncludeActiveItemsIOS: true,
          }),
          queryActiveSubscriptions([...REMINDS_PLUS_SUBSCRIPTION_IDS]),
        ]);
        const resolvedPlan = derivePlan({
          availablePurchases: normalizePurchaseResult(purchases),
          activeSubscriptionProductIds: activeSubscriptionsNow
            .filter((entry) => entry.isActive)
            .map((entry) => entry.productId),
        });
        if (resolvedPlan !== "free") {
          return true;
        }
        if (attempt < maxAttempts - 1) {
          await sleep(700);
        }
      }

      return false;
    } catch (error) {
      if (!isUserCancelled(error)) {
        setErrorMessage(toErrorMessage(error));
      }
      return false;
    } finally {
      setIsRestoring(false);
    }
  }, [connected, refresh, restoreIapPurchases]);

  const value = React.useMemo<PremiumContextValue>(
    () => ({
      isSupported: true,
      isStoreConnected: connected,
      isReady: resolvedIsReady,
      isRefreshing,
      isRestoring,
      hasPremiumAccess,
      plan,
      errorMessage,
      purchaseInFlightProductId,
      monthlyProduct,
      lifetimeProduct,
      refresh,
      purchaseMonthly,
      purchaseLifetime,
      restorePurchases,
      clearError: () => setErrorMessage(null),
    }),
    [
      errorMessage,
      hasPremiumAccess,
      connected,
      isRefreshing,
      isRestoring,
      lifetimeProduct,
      monthlyProduct,
      plan,
      purchaseInFlightProductId,
      purchaseLifetime,
      purchaseMonthly,
      refresh,
      resolvedIsReady,
      restorePurchases,
    ],
  );

  return (
    <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>
  );
}

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "ios") {
    return (
      <PremiumContext.Provider value={unsupportedValue}>
        {children}
      </PremiumContext.Provider>
    );
  }

  return <PremiumProviderIOS>{children}</PremiumProviderIOS>;
}

export function usePremium() {
  return React.useContext(PremiumContext);
}
