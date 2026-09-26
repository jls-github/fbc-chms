import { Ionicons } from "@expo/vector-icons";
import { Redirect, Stack } from "expo-router";
import { Text, View } from "react-native";
import { Button, Centered, ErrorView, Loading } from "../../components/ui";
import { useAuth, useMe } from "../../lib/auth";
import { useTheme } from "../../lib/theme";

function Waiting({ title, body }: { title: string; body: string }) {
  const { signOut } = useAuth();
  const me = useMe();
  const t = useTheme();
  return (
    <Centered>
      <View style={{ maxWidth: 380, alignItems: "center", gap: 14 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="hourglass-outline" size={30} color={t.brand} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: "700", color: t.text, textAlign: "center" }}>{title}</Text>
        <Text style={{ fontSize: 16, color: t.muted, textAlign: "center", lineHeight: 23 }}>{body}</Text>
        <View style={{ gap: 10, alignSelf: "stretch", marginTop: 8 }}>
          <Button title="Check again" icon="refresh" onPress={() => void me.refetch()} loading={me.isFetching} />
          <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </View>
    </Centered>
  );
}

export default function AppLayout() {
  const { ready, signedIn } = useAuth();
  const me = useMe(signedIn);

  if (!ready) return <Loading />;
  if (!signedIn) return <Redirect href="/sign-in" />;
  if (me.isLoading) return <Loading />;
  if (me.error || !me.data) return <Centered><ErrorView error={me.error} onRetry={() => void me.refetch()} /></Centered>;

  const { user, profile } = me.data;
  const first = user.name?.split(" ")[0];
  if (user.status === "pending") {
    return (
      <Waiting
        title={`Thanks${first ? `, ${first}` : ""}!`}
        body="Your account is waiting for the church office to confirm it's you. That usually happens within a day or two — check back soon."
      />
    );
  }
  if (!profile.member) {
    return (
      <Waiting
        title="Almost there"
        body="Your account isn't linked to anyone in the church directory yet. Please contact the church office and they'll get you connected."
      />
    );
  }
  return <Stack screenOptions={{ headerBackTitle: "Back" }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  </Stack>;
}
