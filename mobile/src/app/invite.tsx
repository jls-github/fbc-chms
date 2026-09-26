import { Link, Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { AuthShell } from "../components/auth-shell";
import { Button, FormError, Loading, TextField } from "../components/ui";
import { ApiError, errorMessage, fieldError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

/** Where invitation links land: /app/invite?code=ABCD-EFGH */
export default function Invite() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { ready, signedIn, claimInvite } = useAuth();
  const t = useTheme();
  const [code, setCode] = useState(params.code ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Loading />;
  if (signedIn) return <Redirect href="/" />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await claimInvite(code.trim(), password);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const hasFieldErrors = error instanceof ApiError && Object.keys(error.fieldErrors).length > 0;

  return (
    <AuthShell title="You're invited!" subtitle="Choose a password to finish setting up your account.">
      <FormError message={error && !hasFieldErrors ? errorMessage(error) : null} />
      <TextField label="Invitation code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="ABCD-EFGH" error={fieldError(error, "code")} />
      <TextField
        label="Choose a password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint="At least 8 characters."
        error={fieldError(error, "password")}
        onSubmitEditing={submit}
      />
      <Button title="Finish setting up" onPress={submit} loading={busy} disabled={!code || !password} />
      <Text style={{ color: t.muted, textAlign: "center", fontSize: 15 }}>
        Already set up?{" "}
        <Link href="/sign-in" style={{ color: t.brand, fontWeight: "600" }}>
          Sign in
        </Link>
      </Text>
    </AuthShell>
  );
}
