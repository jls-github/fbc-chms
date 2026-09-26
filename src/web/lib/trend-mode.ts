import { useState } from "react";

export type TrendMode = "weekly" | "rolling";

const KEY = "attendance-trend";

/** Whether attendance charts show each week or the 4-week rolling average. Remembered per browser. */
export function useTrendMode() {
  const [mode, setMode] = useState<TrendMode>(() => {
    try {
      return localStorage.getItem(KEY) === "rolling" ? "rolling" : "weekly";
    } catch {
      return "weekly";
    }
  });
  const update = (next: TrendMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode */
    }
  };
  return [mode, update] as const;
}

export const TREND_OPTIONS = [
  { value: "weekly" as const, label: "Each week" },
  { value: "rolling" as const, label: "4-week average" },
];

/** Tooltip note for a rolling-average point, flagging windows with missing weeks. */
export const windowNote = (count: number, unit = "report") =>
  count >= 4 ? "4-week average" : `4-week average (only ${count} ${unit}${count === 1 ? "" : "s"} in window)`;
