import { Link } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { AuthShell } from "../../components/auth-shell";
import { Button, FormError, TextField } from "../../components/ui";
import { ApiError, errorMessage, fieldError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";

export default function SignUp() {
  const { signUp } = useAuth();
  const t = useTheme();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp(form);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const hasFieldErrors = error instanceof ApiError && Object.keys(error.fieldErrors).length > 0;

  return (
    <AuthShell
      title="Create your account"
      subtitle="The church office will confirm it's you, then you'll see the directory, sermons and your group's chat."
    >
      <FormError message={error && !hasFieldErrors ? errorMessage(error) : null} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField label="First name" value={form.firstName} onChangeText={set("firstName")} autoComplete="given-name" textContentType="givenName" error={fieldError(error, "firstName")} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Last name" value={form.lastName} onChangeText={set("lastName")} autoComplete="family-name" textContentType="familyName" error={fieldError(error, "lastName")} />
        </View>
      </View>
      <TextField
        label="Email"
        value={form.email}
        onChangeText={set("email")}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        error={fieldError(error, "email")}
        hint="Use the email or phone the church has for you — it helps us match your account."
      />
      <TextField label="Mobile phone" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" error={fieldError(error, "phone")} />
      <TextField
        label="Password"
        value={form.password}
        onChangeText={set("password")}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={fieldError(error, "password")}
        hint="At least 8 characters."
      />
      <Button title="Create account" onPress={submit} loading={busy} />
      <Text style={{ color: t.muted, textAlign: "center", fontSize: 15 }}>
        Already have an account?{" "}
        <Link href="/sign-in" style={{ color: t.brand, fontWeight: "600" }}>
          Sign in
        </Link>
      </Text>
    </AuthShell>
  );
}
