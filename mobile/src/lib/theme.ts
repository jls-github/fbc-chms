import { useColorScheme } from "react-native";

/**
 * FBC brand guide v1.0: Grow in Grace teal (#40605f / #8bada6) leads, with
 * the guide's light background. `brand` is for text and icons (lighter in
 * dark mode so it stays readable); `brandFill` is for buttons and badges,
 * which carry white text.
 */
const light = {
  bg: "#eef3f2",
  card: "#ffffff",
  text: "#1c1f1f",
  muted: "#58595b",
  faint: "#8a8d8f",
  border: "#dde4e3",
  brand: "#40605f",
  brandFill: "#40605f",
  brandText: "#ffffff",
  brandSoft: "#dfe9e7",
  accent: "#bb5e2d",
  /** Brand olive, used to tell team chats apart from group chats. */
  olive: "#6f6b2b",
  oliveSoft: "#eceada",
  danger: "#b42318",
  dangerSoft: "#fdecea",
  mine: "#40605f",
  mineText: "#ffffff",
  theirs: "#ffffff",
  success: "#4f6f2a",
};

const dark: typeof light = {
  bg: "#0f1413",
  card: "#171f1e",
  text: "#f1f4f3",
  muted: "#a3adab",
  faint: "#76807e",
  border: "#26302f",
  brand: "#8bada6",
  brandFill: "#40605f",
  brandText: "#ffffff",
  brandSoft: "#1d2a29",
  accent: "#d9814f",
  olive: "#a8a44f",
  oliveSoft: "#25261b",
  danger: "#f97066",
  dangerSoft: "#2a1614",
  mine: "#40605f",
  mineText: "#ffffff",
  theirs: "#232c2b",
  success: "#a8a44f",
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === "dark" ? dark : light);

/** Headline font (Figtree, the free stand-in for the brand's Filson Pro). Loaded in the root layout. */
export const fonts = { heading: "Figtree_700Bold", headingSemi: "Figtree_600SemiBold" };
