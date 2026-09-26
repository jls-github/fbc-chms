import { Redirect, Stack } from "expo-router";
import { Loading } from "../../components/ui";
import { useAuth } from "../../lib/auth";

export default function AuthLayout() {
  const { ready, signedIn } = useAuth();
  if (!ready) return <Loading />;
  if (signedIn) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
