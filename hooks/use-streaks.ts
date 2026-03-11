import { useTasksStore } from "@/context/tasks-store";
import { getIntlLocale } from "@/i18n";
import { useMemo } from "react";

export type ChartDataPoint = {
  label: string;
  count: number;
  dateStr: string; // ISO date or unique key
  isToday?: boolean;
  type?: "day" | "week" | "month";
};

export type StreakStats = {
  currentStreak: number;
  longestStreak: number;
  totalCompleted: number;
  todayCompletedCount: number;
  last7DaysCount: number;
  mostTasksInOneDay: number;
  getChartData: (range: "7d" | "14d" | "1m" | "1y" | "max") => ChartDataPoint[];
};

// Start of the day in local time, formatted as YYYY-MM-DD
function toLocalISODate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalISODate(dateStr: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(dateStr);
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function useStreaks(): StreakStats {
  const { completionHistory } = useTasksStore();

  return useMemo(() => {
    const intlLocale = getIntlLocale();
    const weekdayShortFormatter = new Intl.DateTimeFormat(intlLocale, { weekday: "short" });
    const monthShortFormatter = new Intl.DateTimeFormat(intlLocale, { month: "short" });
    const completionsByDate = new Map<string, number>(
      Object.entries(completionHistory).filter(
        ([, count]) => typeof count === "number" && Number.isFinite(count) && count > 0,
      ),
    );

    const sortedDates = Array.from(completionsByDate.keys()).sort();
    const uniqueDatesSet = new Set(sortedDates);
    const completionCounts = Array.from(completionsByDate.values());
    const totalCompleted = completionCounts.reduce((sum, count) => sum + count, 0);
    const mostTasksInOneDay = Math.max(0, ...completionCounts);

    const today = new Date();
    const todayStr = toLocalISODate(today.getTime());
    const todayCompletedCount = completionsByDate.get(todayStr) || 0;

    let last7DaysCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7DaysCount += completionsByDate.get(toLocalISODate(d.getTime())) || 0;
    }

    let currentStreak = 0;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalISODate(yesterday.getTime());
    const streakActive =
      uniqueDatesSet.has(todayStr) || uniqueDatesSet.has(yesterdayStr);

    if (streakActive) {
      let checkDate = uniqueDatesSet.has(todayStr) ? today : yesterday;
      while (true) {
        const checkStr = toLocalISODate(checkDate.getTime());
        if (!uniqueDatesSet.has(checkStr)) {
          break;
        }
        currentStreak += 1;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;
    for (const dateStr of sortedDates) {
      const d = parseLocalISODate(dateStr);
      if (!prevDate) {
        tempStreak = 1;
      } else {
        const diffTime = Math.abs(d.getTime() - prevDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        tempStreak = diffDays === 1 ? tempStreak + 1 : 1;
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      prevDate = d;
    }

    const getChartData = (
      range: "7d" | "14d" | "1m" | "1y" | "max",
    ): ChartDataPoint[] => {
      const data: ChartDataPoint[] = [];

      if (range === "7d" || range === "14d" || range === "1m") {
        const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dStr = toLocalISODate(d.getTime());
          const dayOfMonth = d.getDate();
          const monthTickLabel =
            dayOfMonth === 1 || dayOfMonth % 5 === 0 ? `${dayOfMonth}.` : "";
          data.push({
            label:
              range === "1m"
                ? monthTickLabel
                : weekdayShortFormatter.format(d).replace(/\.$/u, ""),
            count: completionsByDate.get(dStr) || 0,
            dateStr: dStr,
            isToday: i === 0,
            type: "day",
          });
        }
      } else if (range === "1y") {
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          let sum = 0;
          const targetMonth = d.getMonth();
          const targetYear = d.getFullYear();

          for (const [dateKey, count] of completionsByDate.entries()) {
            const dateKeyObj = parseLocalISODate(dateKey);
            if (
              dateKeyObj.getFullYear() === targetYear &&
              dateKeyObj.getMonth() === targetMonth
            ) {
              sum += count;
            }
          }

          data.push({
            label: monthShortFormatter.format(d).replace(/\.$/u, ""),
            count: sum,
            dateStr: `${targetYear}-${targetMonth}`,
            type: "month",
          });
        }
      } else if (range === "max") {
        if (sortedDates.length === 0) return [];
        const first = parseLocalISODate(sortedDates[0]!);
        const now = new Date();
        let curr = new Date(first.getFullYear(), first.getMonth(), 1);
        let monthIndex = 0;
        const maxLabelEvery = 4;

        while (curr <= now) {
          const targetMonth = curr.getMonth();
          const targetYear = curr.getFullYear();
          let sum = 0;

          for (const [dateKey, count] of completionsByDate.entries()) {
            const dateKeyObj = parseLocalISODate(dateKey);
            if (
              dateKeyObj.getFullYear() === targetYear &&
              dateKeyObj.getMonth() === targetMonth
            ) {
              sum += count;
            }
          }

          const isLastMonth =
            targetYear === now.getFullYear() && targetMonth === now.getMonth();
          const shouldShowLabel = monthIndex % maxLabelEvery === 0 || isLastMonth;
          const shortYear = String(targetYear).slice(-2);
          data.push({
            label: shouldShowLabel ? `${targetMonth + 1}/${shortYear}` : "",
            count: sum,
            dateStr: `${targetYear}-${targetMonth}`,
            type: "month",
          });
          curr.setMonth(curr.getMonth() + 1);
          monthIndex += 1;
        }
      }

      return data;
    };

    return {
      currentStreak,
      longestStreak,
      totalCompleted,
      todayCompletedCount,
      last7DaysCount,
      mostTasksInOneDay,
      getChartData,
    };
  }, [completionHistory]);
}
