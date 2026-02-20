import { useTasksStore } from '@/context/tasks-store';
import { getIntlLocale } from '@/i18n';
import { useMemo } from 'react';

export type ChartDataPoint = {
    label: string;
    count: number;
    dateStr: string; // ISO date or unique key
    isToday?: boolean;
    type?: 'day' | 'week' | 'month';
};

export type StreakStats = {
    currentStreak: number;
    longestStreak: number;
    totalCompleted: number;
    todayCompletedCount: number;
    last7DaysCount: number;
    mostTasksInOneDay: number;
    getChartData: (range: '7d' | '14d' | '1m' | '1y' | 'max') => ChartDataPoint[];
};

// Start of the day in local time, formatted as YYYY-MM-DD
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

export function useStreaks(): StreakStats {
    const { tasks } = useTasksStore();

    return useMemo(() => {
        const intlLocale = getIntlLocale();
        const weekdayShortFormatter = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' });
        const monthShortFormatter = new Intl.DateTimeFormat(intlLocale, { month: 'short' });
        const monthNarrowFormatter = new Intl.DateTimeFormat(intlLocale, { month: 'narrow' });
        // 1. Filter completed tasks
        const completedTasks = tasks.filter((t) => !!t.completedAt);

        // 2. Group by date
        const completionsByDate = new Map<string, number>();
        completedTasks.forEach((t) => {
            const dateStr = toLocalISODate(t.completedAt!);
            completionsByDate.set(dateStr, (completionsByDate.get(dateStr) || 0) + 1);
        });

        // 3. Basic Stats
        const sortedDates = Array.from(completionsByDate.keys()).sort(); // Ascending YYYY-MM-DD
        const uniqueDatesSet = new Set(sortedDates);
        const mostTasksInOneDay = Math.max(0, ...Array.from(completionsByDate.values()));

        const today = new Date();
        const todayStr = toLocalISODate(today.getTime());
        const todayCompletedCount = completionsByDate.get(todayStr) || 0;

        // 4. Last 7 Days Count
        let last7DaysCount = 0;
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            last7DaysCount += completionsByDate.get(toLocalISODate(d.getTime())) || 0;
        }

        // 5. Current Streak Calculation
        let currentStreak = 0;
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = toLocalISODate(yesterday.getTime());

        let streakActive = uniqueDatesSet.has(todayStr) || uniqueDatesSet.has(yesterdayStr);

        if (streakActive) {
            let checkDate = uniqueDatesSet.has(todayStr) ? today : yesterday;
            currentStreak = 0;
            while (true) {
                const checkStr = toLocalISODate(checkDate.getTime());
                if (uniqueDatesSet.has(checkStr)) {
                    currentStreak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }
        }

        // 6. Longest Streak
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
                if (diffDays === 1) tempStreak++;
                else tempStreak = 1;
            }
            if (tempStreak > longestStreak) longestStreak = tempStreak;
            prevDate = d;
        }

        // 7. Dynamic Chart Data
        const getChartData = (range: '7d' | '14d' | '1m' | '1y' | 'max'): ChartDataPoint[] => {
            const data: ChartDataPoint[] = [];

            if (range === '7d' || range === '14d' || range === '1m') {
                const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
                const now = new Date();
                for (let i = days - 1; i >= 0; i--) {
                    const d = new Date(now);
                    d.setDate(d.getDate() - i);
                    const dStr = toLocalISODate(d.getTime());
                    data.push({
                        label: weekdayShortFormatter.format(d).replace(/\.$/u, ''),
                        count: completionsByDate.get(dStr) || 0,
                        dateStr: dStr,
                        isToday: i === 0,
                        type: 'day'
                    });
                }
            } else if (range === '1y') {
                // Aggregate by Month? Or Week? 
                // 1 Year is 12 Months. Let's do Months.
                const now = new Date();
                for (let i = 11; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    // Sum all tasks in this month
                    let sum = 0;
                    // Simple iteration over all sorted dates:
                    // Not efficient but OK for small dataset
                    // Better: iterate days in month?

                    // Let's filter sortedDates for matching Month/Year
                    const targetMonth = d.getMonth();
                    const targetYear = d.getFullYear();

                    // Brute-force sum for that month from our map
                    // Optimization: we only store dates with tasks in Map.
                    for (const [dateKey, count] of completionsByDate.entries()) {
                        const dateKeyObj = parseLocalISODate(dateKey);
                        if (dateKeyObj.getFullYear() === targetYear && dateKeyObj.getMonth() === targetMonth) {
                            sum += count;
                        }
                    }

                    data.push({
                        label: monthShortFormatter.format(d).replace(/\.$/u, ''),
                        count: sum,
                        dateStr: `${targetYear}-${targetMonth}`,
                        type: 'month'
                    });
                }
            } else if (range === 'max') {
                // If dataset is small, show months. If large, years? 
                // Let's assume lifespan is < 5 years for now, so Months is fine.
                // If we have very old data, we start from first date.
                if (sortedDates.length === 0) return [];
                const first = parseLocalISODate(sortedDates[0]!);
                const now = new Date();

                // Iterate months from first to now
                let curr = new Date(first.getFullYear(), first.getMonth(), 1);
                while (curr <= now) {
                    const tM = curr.getMonth();
                    const tY = curr.getFullYear();
                    let sum = 0;
                    for (const [dateKey, count] of completionsByDate.entries()) {
                        const dk = parseLocalISODate(dateKey);
                        if (dk.getFullYear() === tY && dk.getMonth() === tM) {
                            sum += count;
                        }
                    }
                    data.push({
                        label: monthNarrowFormatter.format(curr),
                        count: sum,
                        dateStr: `${tY}-${tM}`,
                        type: 'month'
                    });
                    curr.setMonth(curr.getMonth() + 1);
                }
            }

            return data;
        };

        return {
            currentStreak,
            longestStreak,
            totalCompleted: completedTasks.length,
            todayCompletedCount,
            last7DaysCount,
            mostTasksInOneDay,
            getChartData
        };
    }, [tasks]);
}
