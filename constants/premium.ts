export const REMINDS_PLUS_MONTHLY_PRODUCT_ID =
  "com.anonymous.reminds.plus.monthly";
export const REMINDS_PLUS_LIFETIME_PRODUCT_ID =
  "com.anonymous.reminds.plus.lifetime2";

export const REMINDS_PLUS_PRODUCT_IDS = [
  REMINDS_PLUS_MONTHLY_PRODUCT_ID,
  REMINDS_PLUS_LIFETIME_PRODUCT_ID,
] as const;

export const REMINDS_PLUS_SUBSCRIPTION_IDS = [
  REMINDS_PLUS_MONTHLY_PRODUCT_ID,
] as const;

export const FREE_PROJECT_LIMIT = 4;

export type PremiumPlan = "free" | "monthly" | "lifetime";

export function getPremiumPlanLabel(plan: PremiumPlan): string {
  switch (plan) {
    case "monthly":
      return "Monatlich";
    case "lifetime":
      return "Lifetime";
    default:
      return "Free";
  }
}
