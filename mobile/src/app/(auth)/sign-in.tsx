import { Link } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { AuthShell } from "../../components/auth-shell";
import { Button, FormError, TextField } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";

export default function SignIn() {
  const { signIn } = useAuth();
  const t = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in with your email or phone number.">
      <FormError message={error} />
      <TextField
        label="Email or phone"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        keyboardType="email-address"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Sign in" onPress={submit} loading={busy} disabled={!identifier || !password} />
      <View style={{ gap: 12, marginTop: 8, alignItems: "center" }}>
        <Text style={{ color: t.muted, fontSize: 15 }}>
          New here?{" "}
          <Link href="/sign-up" style={{ color: t.brand, fontWeight: "600" }}>
            Create an account
          </Link>
        </Text>
        <Link href="/invite" style={{ color: t.brand, fontWeight: "600", fontSize: 15 }}>
          I have an invitation code
        </Link>
      </View>
    </AuthShell>
  );
}
