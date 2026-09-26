import { Image } from "expo-image";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme";

/** Centered, keyboard-aware layout for the sign-in screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <View style={styles.brand}>
              <Image source={require("../../assets/icon.png")} style={styles.logo} accessibilityIgnoresInvertColors />
              <Text style={[styles.church, { color: t.text }]}>FBC Enumclaw</Text>
            </View>
            <Text style={[styles.title, { color: t.text }]}>{title}</Text>
            {subtitle && <Text style={[styles.subtitle, { color: t.muted }]}>{subtitle}</Text>}
            <View style={{ gap: 16, marginTop: 24 }}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  inner: { width: "100%", maxWidth: 420, alignSelf: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 28 },
  logo: { width: 40, height: 40, borderRadius: 12 },
  church: { fontSize: 17, fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { fontSize: 16, marginTop: 6, lineHeight: 22 },
});
