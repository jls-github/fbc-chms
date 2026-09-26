import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { EmptyState, ErrorView, Loading } from "../../../components/ui";
import { useGroups } from "../../../lib/queries";
import { chatTime } from "../../../lib/format";
import { useTheme } from "../../../lib/theme";

export default function GroupsScreen() {
  const t = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useGroups(15_000);
  if (isLoading) return <Loading />;
  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;

  return (
    <FlatList
      data={data?.groups ?? []}
      keyExtractor={(g) => String(g.id)}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={t.brand} />}
      ListEmptyComponent={
        <EmptyState icon="chatbubbles-outline" title="You're not in a group yet" body="When the church office adds you to a community group, its chat will show up here." />
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: "/groups/[id]", params: { id: String(item.id), name: item.name } })}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.border : t.card, borderColor: t.border }]}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}${item.unread ? `, ${item.unread} unread` : ""}`}
        >
          <View style={[styles.icon, { backgroundColor: t.brandSoft }]}>
            <Ionicons name="people" size={22} color={t.brand} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>{item.name}</Text>
              {item.lastMessage && <Text style={{ color: item.unread ? t.brand : t.faint, fontSize: 13 }}>{chatTime(item.lastMessage.createdAt)}</Text>}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, color: item.unread ? t.text : t.muted, fontSize: 14, fontWeight: item.unread ? "600" : "400" }} numberOfLines={1}>
                {item.lastMessage ? `${item.lastMessage.authorName}: ${item.lastMessage.body}` : `${item.memberCount} members · say hello!`}
              </Text>
              {item.unread > 0 && (
                <View style={[styles.badge, { backgroundColor: t.brand }]}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{item.unread > 99 ? "99+" : item.unread}</Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
});
