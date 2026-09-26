/** Days since the epoch for a YYYY-MM-DD date (timezone-independent). */
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export const ROLLING_WINDOW_DAYS = 28;

/**
 * Adds a trailing rolling average to date-ordered points. The window is
 * calendar-based (the `windowDays` days ending on each point's date), so a
 * skipped Sunday shortens the window instead of stretching it back in time.
 * `windowCount` says how many reports went into each average.
 */
export function withRollingAverage<T extends { date: string; value: number }>(
  points: T[],
  windowDays = ROLLING_WINDOW_DAYS,
): (T & { rollingAverage: number; windowCount: number })[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const days = sorted.map((p) => dayNumber(p.date));
  let start = 0;
  let sum = 0;
  return sorted.map((point, i) => {
    sum += point.value;
    while (days[start]! <= days[i]! - windowDays) sum -= sorted[start++]!.value;
    const windowCount = i - start + 1;
    return { ...point, rollingAverage: Math.round(sum / windowCount), windowCount };
  });
}

/** The Sunday that starts the (Sunday–Saturday) week containing a YYYY-MM-DD date. */
export function weekStart(iso: string): string {
  const day = dayNumber(iso);
  const dow = (day + 4) % 7; // 1970-01-01 was a Thursday; 0 = Sunday
  return new Date((day - dow) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Sums reports into Sunday–Saturday weeks, oldest first. Weeks with no reports
 * are left out (no data, not zero people).
 */
export function weeklyTotals<T extends { date: string; attendance: number }>(reports: T[]) {
  const weeks = new Map<string, { date: string; value: number; reports: T[] }>();
  for (const r of reports) {
    const key = weekStart(r.date);
    const week = weeks.get(key) ?? { date: key, value: 0, reports: [] };
    week.value += r.attendance;
    week.reports.push(r);
    weeks.set(key, week);
  }
  return [...weeks.values()].sort((a, b) => a.date.localeCompare(b.date));
}
