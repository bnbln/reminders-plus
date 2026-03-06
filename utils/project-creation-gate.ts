import { FREE_PROJECT_LIMIT } from "@/constants/premium";

export function shouldRouteToProjectLimitGate(args: {
  activeProjectCount: number;
  hasPremiumAccess: boolean;
  isReady: boolean;
}) {
  return (
    args.activeProjectCount >= FREE_PROJECT_LIMIT &&
    (!args.isReady || !args.hasPremiumAccess)
  );
}
