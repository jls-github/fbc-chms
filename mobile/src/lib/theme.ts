import { useColorScheme } from "react-native";

const light = {
  bg: "#f7f7f8",
  card: "#ffffff",
  text: "#18181b",
  muted: "#71717a",
  faint: "#a1a1aa",
  border: "#e4e4e7",
  brand: "#3f55d6",
  brandText: "#ffffff",
  brandSoft: "#eef1ff",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  mine: "#3f55d6",
  mineText: "#ffffff",
  theirs: "#ffffff",
  success: "#059669",
};

const dark: typeof light = {
  bg: "#0c0c0e",
  card: "#18181b",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  faint: "#71717a",
  border: "#27272a",
  brand: "#6b7ff0",
  brandText: "#ffffff",
  brandSoft: "#1e2240",
  danger: "#f87171",
  dangerSoft: "#2a1414",
  mine: "#4f63e0",
  mineText: "#ffffff",
  theirs: "#27272a",
  success: "#34d399",
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === "dark" ? dark : light);
