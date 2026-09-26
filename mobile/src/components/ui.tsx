import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { absoluteUrl } from "../lib/api";
import { initials } from "../lib/format";
import { useTheme } from "../lib/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const t = useTheme();
  const colors = {
    primary: { bg: t.brand, fg: t.brandText, border: t.brand },
    secondary: { bg: t.card, fg: t.text, border: t.border },
    ghost: { bg: "transparent", fg: t.brand, border: "transparent" },
    danger: { bg: t.card, fg: t.danger, border: t.border },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.bg, borderColor: colors.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={colors.fg} />}
          <Text style={[styles.buttonText, { color: colors.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextField({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.faint}
        accessibilityLabel={label}
        style={[styles.input, { color: t.text, backgroundColor: t.card, borderColor: error ? t.danger : t.border }]}
        {...props}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : hint ? <Text style={{ color: t.muted, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

/** A household photo, or initials when there isn't one. */
export function Photo({ url, title, size = 56, radius = 12 }: { url: string | null; title: string; size?: number; radius?: number }) {
  const t = useTheme();
  if (url) {
    return (
      <Image
        source={{ uri: absoluteUrl(url) }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: t.border }}
        contentFit="cover"
        transition={150}
        accessibilityLabel={`${title} photo`}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: t.brand, fontWeight: "700", fontSize: size * 0.34 }}>{initials(title)}</Text>
    </View>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.centered, { backgroundColor: t.bg }]}>{children}</View>;
}

export function Loading() {
  const t = useTheme();
  return (
    <Centered>
      <ActivityIndicator color={t.brand} />
    </Centered>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.brandSoft }]}>
        <Ionicons name={icon} size={26} color={t.brand} />
      </View>
      <Text style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>
      {body && <Text style={[styles.emptyBody, { color: t.muted }]}>{body}</Text>}
      {action}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Couldn't load this"
      body={error instanceof Error ? error.message : "Something went wrong."}
      action={onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />}
    />
  );
}

export function FormError({ message }: { message?: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={[styles.formError, { backgroundColor: t.dangerSoft }]}>
      <Ionicons name="alert-circle" size={18} color={t.danger} />
      <Text style={{ color: t.danger, flex: 1 }}>{message}</Text>
    </View>
  );
}

/** Yes/no prompt that works on phones (native alert) and the web (window.confirm). */
export function confirm(title: string, message: string, confirmLabel = "OK", destructive = false): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ]),
  );
}

export const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
  label: { fontSize: 14, fontWeight: "600" },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  emptyBody: { fontSize: 15, textAlign: "center", lineHeight: 21, maxWidth: 320 },
  formError: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 12, alignItems: "flex-start" },
});
