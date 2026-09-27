import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import type { ChatRoom } from "@shared/schemas";
import { EmptyState, ErrorView, Loading } from "../../../components/ui";
import { chatTime } from "../../../lib/format";
import { useChats } from "../../../lib/queries";
import { fonts, useTheme } from "../../../lib/theme";

export default function ChatsScreen() {
  const t = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useChats(15_000);
  if (isLoading) return <Loading />;
  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;

  const sections = [
    { title: "Groups", data: data?.groups ?? [] },
    { title: "Teams", data: data?.teams ?? [] },
  ].filter((s) => s.data.length > 0);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(c) => `${c.kind}-${c.id}`}
      stickySectionHeadersEnabled={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={t.brand} />}
      ListEmptyComponent={
        <EmptyState
          icon="chatbubbles-outline"
          title="No chats yet"
          body="When the church office adds you to a community group or a ministry team, its chat will show up here."
        />
      }
      renderSectionHeader={({ section }) => (
        <Text style={[styles.section, { color: t.muted, fontFamily: fonts.heading }]} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => <ChatRow chat={item} />}
    />
  );
}

function ChatRow({ chat }: { chat: ChatRoom }) {
  const t = useTheme();
  const team = chat.kind === "team";
  const subtitle = chat.lastMessage
    ? `${chat.lastMessage.authorName}: ${chat.lastMessage.body}`
    : `${chat.memberCount} ${chat.memberCount === 1 ? "person" : "people"}${chat.detail ? ` · ${chat.detail}` : ""} · say hello!`;
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/chats/[kind]/[id]", params: { kind: team ? "teams" : "groups", id: String(chat.id), name: chat.name } })
      }
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.border : t.card, borderColor: t.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${chat.name}, ${team ? "team" : "group"} chat${chat.unread ? `, ${chat.unread} unread` : ""}`}
    >
      <View style={[styles.icon, { backgroundColor: team ? t.oliveSoft : t.brandSoft }]}>
        <Ionicons name={team ? "hand-left" : "people"} size={22} color={team ? t.olive : t.brand} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>
            {chat.name}
          </Text>
          {chat.lastMessage && <Text style={{ color: chat.unread ? t.brand : t.faint, fontSize: 13 }}>{chatTime(chat.lastMessage.createdAt)}</Text>}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, color: chat.unread ? t.text : t.muted, fontSize: 14, fontWeight: chat.unread ? "600" : "400" }} numberOfLines={1}>
            {subtitle}
          </Text>
          {chat.unread > 0 && (
            <View style={[styles.badge, { backgroundColor: t.accent }]}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{chat.unread > 99 ? "99+" : chat.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
});
