import { Figtree_600SemiBold, Figtree_700Bold, useFonts } from "@expo-google-fonts/figtree";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiError } from "../lib/api";
import { AuthProvider } from "../lib/auth";

export default function RootLayout() {
  // Headline font from the brand guide (see lib/theme.ts). Text renders in the
  // system font until it loads, so there's no blank screen on slow connections.
  useFonts({ Figtree_600SemiBold, Figtree_700Bold });
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: (n, err) => !(err instanceof ApiError && err.status > 0 && err.status < 500) && n < 2, staleTime: 30_000 },
        },
      }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
