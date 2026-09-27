import { Image } from "expo-image";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fonts, useTheme } from "../lib/theme";

/** Centered, keyboard-aware layout for the sign-in screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const t = useTheme();
  const dark = useColorScheme() === "dark";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <View style={styles.brand}>
              <Image
                source={dark ? require("../../assets/brand/logo-alt-on-dark.png") : require("../../assets/brand/logo-alt.png")}
                style={styles.logo}
                contentFit="contain"
                contentPosition="left"
                accessibilityLabel="First Baptist Church"
              />
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
  logo: { width: 220, height: 58 },
  title: { fontSize: 28, fontFamily: fonts.heading, letterSpacing: -0.3 },
  subtitle: { fontSize: 16, marginTop: 6, lineHeight: 22 },
});
