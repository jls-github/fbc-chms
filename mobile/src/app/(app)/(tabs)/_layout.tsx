import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import type { ChatGroup } from "@shared/schemas";
import { api } from "../../../lib/api";
import { useTheme } from "../../../lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => api.get<{ groups: ChatGroup[] }>("/app/groups"), refetchInterval: 30_000 });
  const unread = groups.data?.groups.reduce((n, g) => n + g.unread, 0) ?? 0;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.card },
        headerTitleStyle: { color: t.text, fontWeight: "700" },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Directory", tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen name="sermons" options={{ title: "Sermons", tabBarIcon: ({ color, size }) => <Ionicons name="play-circle" color={color} size={size} /> }} />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />
    </Tabs>
  );
}
