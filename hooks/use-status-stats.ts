import { useTasksStore } from '@/context/tasks-store';
import { useAppSettings } from '@/context/settings-store';
import { getIntlLocale } from '@/i18n';
import { getFakeStatsDataset } from '@/utils/fake-stats';
import { hasValidDueAt } from '@/utils/task-dates';
import { useMemo } from 'react';

export type StatusRangeOption = '7d' | '14d' | '1m' | '1y' | 'max';

export type StatusChartDataPoint = {
  label: string;
  completionRate: number;
  completedCount: number;
  totalCount: number;
  dateStr: string;
  isToday?: boolean;
  type?: 'day' | 'month';
};

export type StatusStats = {
  todayCompletedCount: number;
  todayTotalCount: number;
  todayCompletionRate: number;
  last7DaysCompletedCount: number;
  last7DaysTotalCount: number;
  last7DaysCompletionRate: number;
  overallCompletedCount: number;
  overallTasksCount: number;
  overallCompletionRate: number;
  bestDayCompletedCount: number;
  bestDayTotalCount: number;
  bestDayCompletionRate: number;
  getChartData: (range: StatusRangeOption) => StatusChartDataPoint[];
};

type MonthBucket = {
  totalCount: number;
  completedCount: number;
};

function toLocalISODate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalISODate(dateStr: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(dateStr);
  }

  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getCompletionRate(completedCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  return Math.round((completedCount / totalCount) * 100);
}

export function useStatusStats(): StatusStats {
  const { tasks } = useTasksStore();
  const { fakeStatsEnabled } = useAppSettings();
  const shouldUseFakeStats = __DEV__ && fakeStatsEnabled;

  return useMemo(() => {
    const intlLocale = getIntlLocale();
    const weekdayShortFormatter = new Intl.DateTimeFormat(intlLocale, {
      weekday: 'short',
    });
    const monthShortFormatter = new Intl.DateTimeFormat(intlLocale, {
      month: 'short',
    });

    const totalsByDate = new Map<string, number>();
    const completionsByDate = new Map<string, number>();
    const activeTasks = tasks.filter((task) => !task.deletedAt);

    if (shouldUseFakeStats) {
      const fakeDataset = getFakeStatsDataset();

      for (const [dateKey, bucket] of Object.entries(fakeDataset.statusByDate)) {
        if (bucket.totalCount > 0) {
          totalsByDate.set(dateKey, bucket.totalCount);
        }
        if (bucket.completedCount > 0) {
          completionsByDate.set(dateKey, bucket.completedCount);
        }
      }
    } else {
      for (const task of activeTasks) {
        const dueDate = hasValidDueAt(task.dueAt) ? toLocalISODate(task.dueAt) : null;
        const completedDate = hasValidDueAt(task.completedAt)
          ? toLocalISODate(task.completedAt)
          : null;

        const plannedDates = new Set<string>();
        if (dueDate) plannedDates.add(dueDate);
        if (completedDate) plannedDates.add(completedDate);

        for (const dateKey of plannedDates) {
          totalsByDate.set(dateKey, (totalsByDate.get(dateKey) ?? 0) + 1);
        }

        if (completedDate) {
          completionsByDate.set(
            completedDate,
            (completionsByDate.get(completedDate) ?? 0) + 1,
          );
        }
      }
    }

    const sortedDateKeys = Array.from(totalsByDate.keys()).sort();
    const monthBuckets = new Map<string, MonthBucket>();

    for (const dateKey of sortedDateKeys) {
      const date = parseLocalISODate(dateKey);
      const monthKey = toMonthKey(date);
      const totalCount = totalsByDate.get(dateKey) ?? 0;
      const completedCount = completionsByDate.get(dateKey) ?? 0;
      const prev = monthBuckets.get(monthKey);

      if (prev) {
        prev.totalCount += totalCount;
        prev.completedCount += completedCount;
        continue;
      }

      monthBuckets.set(monthKey, { totalCount, completedCount });
    }

    const now = new Date();
    const todayStr = toLocalISODate(now.getTime());
    const todayTotalCount = totalsByDate.get(todayStr) ?? 0;
    const todayCompletedCount = completionsByDate.get(todayStr) ?? 0;
    const todayCompletionRate = getCompletionRate(todayCompletedCount, todayTotalCount);

    let last7DaysTotalCount = 0;
    let last7DaysCompletedCount = 0;
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      const dayStr = toLocalISODate(day.getTime());
      last7DaysTotalCount += totalsByDate.get(dayStr) ?? 0;
      last7DaysCompletedCount += completionsByDate.get(dayStr) ?? 0;
    }
    const last7DaysCompletionRate = getCompletionRate(
      last7DaysCompletedCount,
      last7DaysTotalCount,
    );

    const overallTasksCount = shouldUseFakeStats
      ? Array.from(totalsByDate.values()).reduce((sum, count) => sum + count, 0)
      : activeTasks.length;
    const overallCompletedCount = shouldUseFakeStats
      ? Array.from(completionsByDate.values()).reduce(
          (sum, count) => sum + count,
          0,
        )
      : activeTasks.reduce((sum, task) => {
          return hasValidDueAt(task.completedAt) ? sum + 1 : sum;
        }, 0);
    const overallCompletionRate = getCompletionRate(
      overallCompletedCount,
      overallTasksCount,
    );

    let bestDayCompletionRate = 0;
    let bestDayCompletedCount = 0;
    let bestDayTotalCount = 0;
    let bestDayDate = '';

    for (const dateKey of sortedDateKeys) {
      const totalCount = totalsByDate.get(dateKey) ?? 0;
      if (totalCount <= 0) continue;

      const completedCount = completionsByDate.get(dateKey) ?? 0;
      const completionRate = getCompletionRate(completedCount, totalCount);
      const isBetter =
        completionRate > bestDayCompletionRate ||
        (completionRate === bestDayCompletionRate &&
          completedCount > bestDayCompletedCount) ||
        (completionRate === bestDayCompletionRate &&
          completedCount === bestDayCompletedCount &&
          dateKey > bestDayDate);

      if (!isBetter) continue;

      bestDayCompletionRate = completionRate;
      bestDayCompletedCount = completedCount;
      bestDayTotalCount = totalCount;
      bestDayDate = dateKey;
    }

    const getChartData = (range: StatusRangeOption): StatusChartDataPoint[] => {
      const data: StatusChartDataPoint[] = [];

      if (range === '7d' || range === '14d' || range === '1m') {
        const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;

        for (let i = days - 1; i >= 0; i -= 1) {
          const day = new Date(now);
          day.setDate(day.getDate() - i);

          const dateStr = toLocalISODate(day.getTime());
          const totalCount = totalsByDate.get(dateStr) ?? 0;
          const completedCount = completionsByDate.get(dateStr) ?? 0;
          const completionRate = getCompletionRate(completedCount, totalCount);
          const dayOfMonth = day.getDate();
          const monthTickLabel =
            dayOfMonth === 1 || dayOfMonth % 5 === 0 ? `${dayOfMonth}.` : '';

          data.push({
            label:
              range === '1m'
                ? monthTickLabel
                : weekdayShortFormatter.format(day).replace(/\.$/u, ''),
            completionRate,
            completedCount,
            totalCount,
            dateStr,
            isToday: i === 0,
            type: 'day',
          });
        }

        return data;
      }

      if (range === '1y') {
        for (let i = 11; i >= 0; i -= 1) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthKey = toMonthKey(date);
          const bucket = monthBuckets.get(monthKey);
          const totalCount = bucket?.totalCount ?? 0;
          const completedCount = bucket?.completedCount ?? 0;

          data.push({
            label: monthShortFormatter.format(date).replace(/\.$/u, ''),
            completionRate: getCompletionRate(completedCount, totalCount),
            completedCount,
            totalCount,
            dateStr: monthKey,
            type: 'month',
          });
        }

        return data;
      }

      if (sortedDateKeys.length === 0) return [];

      const firstDate = parseLocalISODate(sortedDateKeys[0]!);
      const firstMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const maxLabelEvery = 4;
      let monthIndex = 0;

      for (
        const cursor = new Date(firstMonth);
        cursor <= currentMonth;
        cursor.setMonth(cursor.getMonth() + 1), monthIndex += 1
      ) {
        const monthKey = toMonthKey(cursor);
        const bucket = monthBuckets.get(monthKey);
        const totalCount = bucket?.totalCount ?? 0;
        const completedCount = bucket?.completedCount ?? 0;
        const isLastMonth =
          cursor.getFullYear() === currentMonth.getFullYear() &&
          cursor.getMonth() === currentMonth.getMonth();
        const shouldShowLabel = monthIndex % maxLabelEvery === 0 || isLastMonth;
        const shortYear = String(cursor.getFullYear()).slice(-2);

        data.push({
          label: shouldShowLabel ? `${cursor.getMonth() + 1}/${shortYear}` : '',
          completionRate: getCompletionRate(completedCount, totalCount),
          completedCount,
          totalCount,
          dateStr: monthKey,
          type: 'month',
        });
      }

      return data;
    };

    return {
      todayCompletedCount,
      todayTotalCount,
      todayCompletionRate,
      last7DaysCompletedCount,
      last7DaysTotalCount,
      last7DaysCompletionRate,
      overallCompletedCount,
      overallTasksCount,
      overallCompletionRate,
      bestDayCompletedCount,
      bestDayTotalCount,
      bestDayCompletionRate,
      getChartData,
    };
  }, [tasks, shouldUseFakeStats]);
}
