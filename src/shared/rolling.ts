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
